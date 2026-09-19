const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('dist/app.js','utf8');
const node={textContent:'',value:'Strażnik',classList:{remove(){}}};
const state={funds:48250,staff:8,placements:[],regime:{morning:'Czas wolny',afternoon:'Spacer'},minutes:580,day:8,pending:null,saved:false};
let storage=null,fail=false;const messages=[];
const ctx={state,catalog:[{id:'wall',price:50}],embeddedPreview:false,Date,JSON,Number,appStorage:{getItem:()=>storage,setItem:(k,v)=>{if(fail)throw Error('storage blocked');storage=v}},$:()=>node,$$:()=>[],toast:m=>messages.push(m),drawPlacements(){},updateStats(){},updateClock(){},renderPanel(){},closeModal(){},showGuide(){}};
vm.createContext(ctx);
const start=source.indexOf('const actions={'),end=source.indexOf("\ndocument.addEventListener('click'",start);
vm.runInContext(source.slice(start,end)+'\nthis.actions=actions;',ctx);
for(const name of ['markDirty','isCurrentSchedule']){const fn=source.split('\n').find(l=>l.startsWith('function '+name+'('));vm.runInContext(fn,ctx)}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name)}
test('save then mutation marks footer dirty',()=>{ctx.actions.save();assert.equal(state.saved,true);state.pending={item:'wall',x:1,y:2,cost:50};ctx.actions['confirm-plan']();assert.equal(state.funds,48200);assert.equal(state.saved,false);assert.match(node.textContent,/Niezapisane/)});
test('undo restores cost',()=>{ctx.actions.undo();assert.equal(state.funds,48250);assert.equal(state.placements.length,0)});
test('load restores valid data and cancels armed tool',()=>{state.armed=true;state.funds=1;ctx.actions.load();assert.equal(state.funds,48250);assert.equal(state.armed,false)});
test('malformed JSON leaves state unchanged',()=>{storage='{';const before=JSON.stringify(state);ctx.actions.load();assert.equal(JSON.stringify(state),before)});
test('tampered plan price is rejected',()=>{storage=JSON.stringify({...state,version:1,placements:[{item:'wall',x:1,y:2,cost:5000}]});const before=JSON.stringify(state);ctx.actions.load();assert.equal(JSON.stringify(state),before)});
test('fractional clock minute rejected',()=>{storage=JSON.stringify({...state,version:1,minutes:580.5});const before=JSON.stringify(state);ctx.actions.load();assert.equal(JSON.stringify(state),before)});
test('blocked storage does not report success',()=>{fail=true;ctx.markDirty();ctx.actions.save();assert.equal(state.saved,false);assert.match(messages.at(-1),/Nie udało/)});
test('schedule boundaries and overnight period',()=>{assert(ctx.isCurrentSchedule('09:00–12:00',580));assert(!ctx.isCurrentSchedule('09:00–12:00',720));assert(ctx.isCurrentSchedule('21:00–06:00',60));assert(!ctx.isCurrentSchedule('21:00–06:00',360))});
test('embedded storage cannot write main save',()=>{const c={embeddedPreview:true,Map,localStorage:{getItem(){throw Error('must not read')},setItem(){throw Error('must not write')}}};vm.createContext(c);vm.runInContext(source.split('\n').filter(l=>l.startsWith('const previewMemory')||l.startsWith('const appStorage')).join('\n')+'\nappStorage.setItem("test","ok");this.value=appStorage.getItem("test");',c);assert.equal(c.value,'ok')});
console.log(count+' behavioral checks passed (VM, not browser tests).');
