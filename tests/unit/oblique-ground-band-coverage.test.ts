import {describe,expect,it} from 'vitest';
import {SparseWorld} from '../../src/simulation/world/sparse-world';
import {chunkCoordinate} from '../../src/simulation/world/coordinates';
import {WorldRenderView} from '../../src/rendering/world/world-view';
import {projectObliqueWorldFrame} from '../../src/rendering/camera/oblique-world-projection';
import type {ObliqueCameraState} from '../../src/rendering/camera/oblique-projection';
import type {TileQuad} from '../../src/rendering/camera/oblique-geometry';

function contains(quad:TileQuad,x:number,y:number):boolean {
  let sign=0;
  for(let i=0;i<4;i++){
    const a=quad[i]!,b=quad[(i+1)%4]!;
    const cross=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
    if(Math.abs(cross)<1e-6)continue;
    const next=Math.sign(cross);if(sign!==0 && sign!==next)return false;sign=next;
  }
  return true;
}
describe('geometric diagnosis of the 2560-pixel horizontal ground band',()=>{
  it('covers loaded ground above, inside and below the observed screen row',()=>{
    const world=new SparseWorld(32);world.load({x:chunkCoordinate(0),y:chunkCoordinate(0)});
    const camera:ObliqueCameraState={target:{x:1024,y:1024},viewport:{width:2560,height:1080},zoom:1,yawRadians:-Math.PI/4,elevationRadians:Math.PI/4};
    const projection=projectObliqueWorldFrame({revision:1,world:WorldRenderView.fromSnapshot(world.snapshot()),structures:[],actors:[],rooms:[],roomConditions:[]},camera);
    for(const y of [980,1000,1040])for(const x of [650,900,1200,1500,1800])expect(projection.ground.some(tile=>contains(tile.quad,x,y)),`loaded ground covers screen ${x},${y}`).toBe(true);
  });
});
