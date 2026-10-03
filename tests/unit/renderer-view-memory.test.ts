import {expect,it} from 'vitest';
import {captureObliqueView,restoreObliqueView,boundedRendererView} from '../../src/rendering/camera/renderer-view-memory';
const pose={target:{x:384.25,y:-83.75},zoom:1.7,yawRadians:0.37,elevationRadians:0.8,viewport:{width:1920,height:1080}};
it('keeps pixel centre and exact mode-specific zoom and angles through a renderer round trip',()=>{
  const view=captureObliqueView(pose);
  const restored=restoreObliqueView({...pose,target:{x:0,y:0},zoom:1.25,yawRadians:-1,elevationRadians:1},view);
  expect(restored).toEqual(pose);
  expect(restored.target).not.toBe(pose.target);
});
it('uses current viewport and defaults when the previous mode has no oblique pose',()=>{
  const next=restoreObliqueView(pose,{centre:{x:-12,y:500},zoom:0.75});
  expect(next.target).toEqual({x:-12,y:500});expect(next.viewport).toBe(pose.viewport);
  expect(next.yawRadians).toBe(pose.yawRadians);expect(next.zoom).toBe(0.75);
});
it('keeps existing zoom and elevation bounds and rejects non-finite view state',()=>{
  expect(boundedRendererView({centre:{x:0,y:0},zoom:20}).zoom).toBe(3);
  expect(restoreObliqueView(pose,{centre:{x:0,y:0},zoom:0.01,elevationRadians:0}).elevationRadians).toBeCloseTo(20*Math.PI/180);
  expect(()=>boundedRendererView({centre:{x:NaN,y:0},zoom:1})).toThrow('finite');
});
