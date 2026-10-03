import { appendFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { buildCellBlockFixture } from '../../../tests/helpers/navigation-fixture';
import { NavigationSystem } from '../../../src/simulation/navigation/navigation-system';
import { packCommand, type SimulationCommand } from '../../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../../src/persistence/save-schema';
import { tileCoordinate } from '../../../src/simulation/world/coordinates';
import { DEFAULT_ACTIONS } from '../../../src/simulation/prisoners/actions';

function receipt(data:unknown) {const path=process.env['LOCKSTATE_CONNECTIVITY_REVIEW_RECEIPT'];if(path!==undefined)appendFileSync(path,JSON.stringify(data)+'\n');}
const tile=(x:number,y:number)=>({x:tileCoordinate(x),y:tileCoordinate(y)});
function send(runtime:SimulationRuntime,command:SimulationCommand) {
  const sequence=runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand('review-'+sequence,sequence,runtime.kernel.tick,packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function until(runtime:SimulationRuntime,predicate:()=>boolean) {
  for(let tick=0;tick<30_000&&!predicate();tick++)runtime.kernel.step();expect(predicate()).toBe(true);
}
function finish(runtime:SimulationRuntime) {until(runtime,()=>runtime.roomTemplates.snapshot().pending.length===0&&runtime.construction.allOrders().every(order=>order.state==='completed'));}

it.each([16,64,256])('warm query cost at %i cells preserves queued work and matches prior graph freshness scans',cells=>{
  const fixture=buildCellBlockFixture(cells);
  const navigation=new NavigationSystem(fixture.world,{workBudgetPerTick:40,agingIntervalTicks:10,flowFieldActivationThreshold:6},fixture.doors);
  navigation.setLoadedChunks(fixture.chunkPositions);
  const origin=fixture.corridorTiles[0]!,destination=fixture.cellTiles[0]!;
  expect(navigation.sharesPhysicalComponent(origin,destination)).toBe(true);
  const graph=navigation.getGraph(),snapshot=navigation.getWorkSnapshot(),metrics=navigation.getQueueMetrics();
  const chunks=vi.spyOn(fixture.world,'getChunk'),portals=vi.spyOn(graph.regionPortals,'get');
  for(let query=0;query<100;query++)expect(navigation.sharesPhysicalComponent(origin,destination)).toBe(true);
  const physicalReads=chunks.mock.calls.length;
  expect(physicalReads).toBe(100*fixture.chunkPositions.length);expect(portals).not.toHaveBeenCalled();
  chunks.mockClear();
  // #2013 used getGraph().tileToRegion.has(...) for every candidate. Compare
  // its exact public freshness route, without copied implementation or timing.
  for(let query=0;query<100;query++)expect(navigation.getGraph().tileToRegion.has(`${destination.x},${destination.y}`)).toBe(true);
  const previousReads=chunks.mock.calls.length;
  expect(previousReads).toBe(physicalReads);expect(navigation.getQueueMetrics()).toEqual(metrics);expect(navigation.getWorkSnapshot()).toEqual(snapshot);
  chunks.mockRestore();portals.mockRestore();
  receipt({kind:'warm-query-cost',cells,loadedChunks:fixture.chunkPositions.length,queries:100,physicalReads,previousReads,portalWalks:0,queueUnchanged:true});
});

it('integrated q1 Common Room plus inaccessible first Shower keeps independent V8 continuations identical with only one cache warmed',()=>{
  const runtime=createNewSimulationRuntime(73);
  for(const [templateId,x,y,quarterTurns] of [
    ['storage-room-basic',2,2,0],['delivery-bay-basic',20,2,0],['common-room-basic',12,2,1],
    ['shower-room',20,14,1],['shower-room',5,14,1],['cell-basic',5,24,1],
  ] as const)send(runtime,{type:'PlaceRoomTemplate',templateId,origin:{x,y},quarterTurns});
  finish(runtime);
  const benchRows=runtime.placedObjects.getSnapshot().filter(row=>row.objectId==='object.bench');
  expect(benchRows.map(row=>({anchor:row.anchorTile,orientation:row.orientation,order:row.sourceOrderId}))).toEqual([
    {anchor:tile(17,3),orientation:1,order:'room-template-000000000002-2-object-000'},
    {anchor:tile(15,5),orientation:1,order:'room-template-000000000002-2-object-001'},
  ]);
  expect(runtime.prisoners.roomInstances.allByRoomCatalogId('room.common-room').map(room=>({anchor:room.anchorTile,width:room.width,height:room.height}))).toEqual([{anchor:tile(13,3),width:5,height:5}]);
  const ring=[];
  for(let y=12;y<=20;y++)for(let x=18;x<=26;x++)if(x===18||x===26||y===12||y===20){ring.push({x,y});send(runtime,{type:'PlaceBuildOrder',orderId:`review-ring-${x}-${y}`,definitionId:'wall-brick',x,y,footprint:'square',transactionId:'review-ring'});}
  finish(runtime);expect(ring).toHaveLength(32);
  send(runtime,{type:'HireStaff',staffRoleId:'staff-role.guard',x:16,y:16});
  send(runtime,{type:'AdmitPrisoner',sentenceLengthTicks:100_000,priorIncidents:0,x:16,y:16});
  until(runtime,()=>runtime.prisoners.roomInstances.totalOccupancy===1);
  const regime=runtime.prisoners.regimes.all().find(row=>row.classificationGroupId==='general-population')!;
  for(const block of regime.blocks)send(runtime,{type:'EditRegimeBlock',classificationGroupId:'general-population',startTickOfDay:block.startTickOfDay,allowedCategories:['hygiene']});
  const saved=captureSessionSnapshot(runtime);
  const envelope=createSaveEnvelope({...saved,gameVersion:'review',prisonId:'common-room-connectivity-review',revision:1,createdAt:0,updatedAt:1});
  expect(envelope.saveSchemaVersion).toBe(8);
  const decoded=decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);if(!decoded.ok)throw Error('Actual integrated V8 save failed');
  const a=restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  const b=restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  expect(captureSessionSnapshot(a)).toEqual(captureSessionSnapshot(b));
  const position=tile(a.prisoners.position.tileX[0]!,a.prisoners.position.tileY[0]!);
  const work=a.navigation.getWorkSnapshot(),beforeQueries=captureSessionSnapshot(a);
  for(let query=0;query<200;query++){
    expect(a.navigation.sharesPhysicalComponent(position,tile(21,15))).toBe(false);
    expect(a.navigation.sharesPhysicalComponent(position,tile(6,15))).toBe(true);
  }
  expect(a.navigation.getWorkSnapshot()).toEqual(work);expect(captureSessionSnapshot(a)).toEqual(beforeQueries);
  const entityId=a.prisoners.entityStore.getIdByIndex(0),targets=new Set<string|undefined>();let showerTicks=0;
  for(let tick=1;tick<=9_000;tick++){
    a.kernel.step();b.kernel.step();
    if(a.prisoners.currentAction.phase[0]===2&&DEFAULT_ACTIONS[a.prisoners.currentAction.actionIndex[0]!]!.id==='action.shower'){
      showerTicks++;targets.add(a.prisoners.coldState.getActionTarget(entityId));
    }
    if(tick%750===0)expect(captureSessionSnapshot(a)).toEqual(captureSessionSnapshot(b));
  }
  expect(showerTicks).toBeGreaterThan(0);expect([...targets]).toEqual(['room.shower-room:6:15']);expect(a.prisoners.needs.getScaled(0,'hygiene')).toBeGreaterThan(40_000);
  expect(saved.simulation?.objects).toBeDefined();
  expect(a.placedObjects.getSnapshot()).toEqual(saved.simulation!.objects!.placedObjects);
  receipt({kind:'integrated-v8-continuation',seed:73,quarterTurns:1,benches:benchRows,ringCount:32,queryPairs:200,saveSchemaVersion:8,pairedTicks:9000,wholeSnapshotComparisons:12,targets:[...targets],showerTicks,hygiene:a.prisoners.needs.getScaled(0,'hygiene')});
},30_000);
