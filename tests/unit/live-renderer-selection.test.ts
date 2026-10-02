import { expect, it, vi } from 'vitest';
import { LiveRendererSelection } from '../../src/rendering/scene/live-renderer-selection';

function setup() {
  const feed = {}, worker = {};
  let serial=0;
  const create=(mode:string)=>({mode,id:++serial,feed,worker});
  const initial=create('world');
  const prepare=vi.fn(async(mode:string)=>create(mode));
  const activate=vi.fn(async(_scene:ReturnType<typeof create>)=>{});
  const deactivate=vi.fn((_scene:ReturnType<typeof create>)=>{});
  const changed=vi.fn();
  const controller=new LiveRendererSelection({mode:'world',scene:initial},{prepare,activate,deactivate,changed});
  return {controller,initial,feed,worker,prepare,activate,deactivate,changed};
}

it('replaces only renderer instances while retaining shared live session dependencies',async()=>{
  const s=setup();
  await s.controller.select('oblique');
  expect(s.deactivate).toHaveBeenCalledWith(s.initial);
  expect(s.controller.current.mode).toBe('oblique');
  expect(s.controller.current.scene.feed).toBe(s.feed);
  expect(s.controller.current.scene.worker).toBe(s.worker);
  await s.controller.select('world');
  expect(s.controller.current.scene.feed).toBe(s.feed);
  expect(s.prepare).toHaveBeenCalledTimes(2);
});

it('does not withdraw the playable renderer when catalogue preparation fails',async()=>{
  const s=setup();s.prepare.mockRejectedValueOnce(new Error('catalogue'));
  await expect(s.controller.select('oblique')).rejects.toThrow('catalogue');
  expect(s.deactivate).not.toHaveBeenCalled();
  expect(s.activate).not.toHaveBeenCalled();
  expect(s.controller.current.scene).toBe(s.initial);
});

it('reconstructs the previous renderer after activation failure and accepts a later switch',async()=>{
  const s=setup();s.activate.mockRejectedValueOnce(new Error('texture'));
  await expect(s.controller.select('oblique')).rejects.toThrow('texture');
  expect(s.controller.current.mode).toBe('world');
  expect(s.controller.current.scene).not.toBe(s.initial);
  expect(s.controller.current.scene.feed).toBe(s.feed);
  expect(s.deactivate).toHaveBeenCalledTimes(2);
  await s.controller.select('oblique');
  expect(s.controller.current.mode).toBe('oblique');
});

it('serializes repeated selections and skips the already-active mode',async()=>{
  const s=setup();let release!:()=>void;
  s.prepare.mockImplementationOnce(async(mode:string)=>{await new Promise<void>(resolve=>{release=resolve;});return {...s.initial,mode};});
  const first=s.controller.select('oblique');const second=s.controller.select('world');
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  expect(s.prepare).toHaveBeenCalledTimes(1);
  release();await first;await second;
  await s.controller.select('world');
  expect(s.prepare).toHaveBeenCalledTimes(2);
  expect(s.changed.mock.calls.map(([selection])=>selection.mode)).toEqual(['oblique','world']);
});
