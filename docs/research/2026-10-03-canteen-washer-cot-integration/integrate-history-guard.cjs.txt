const fs=require('fs'),cp=require('child_process');
function git(args,allow=false){const r=cp.spawnSync('git',['-c','core.longpaths=true',...args],{encoding:'utf8'});if(r.status!==0&&!allow)throw Error(args.join(' ')+'\n'+r.stdout+r.stderr);return r;}
function canonical(row){row=row.replace(/\]\((2026-10-03-[^)]*)\)/g,'](./$1)');const cells=row.split('|');if(cells.length===6&&row.includes('2026-10-03-guard-rear-belt-connections'))row='|'+cells[1]+'|'+cells[2]+'|'+cells[3].trim()+' '+cells[4].trim()+'|';return row;}
function resolve(keys){const p='docs/research/README.md';const files=git(['diff','--name-only','--diff-filter=U']).stdout.trim().split('\n');if(files.length!==1||files[0]!==p)throw Error('Unexpected conflicts '+files);const ours=git(['show',':2:'+p]).stdout.split('\n'),theirs=git(['show',':3:'+p]).stdout.split('\n'),base=git(['show',':1:'+p]).stdout.split('\n');for(let row of theirs.filter(x=>x.startsWith('|')&&!base.includes(x))){const match=row.match(/(2026-10-03-[\w-]+)\/README\.md/);if(!match||!keys.includes(match[1]))throw Error('Out-of-scope incoming index row '+row);row=canonical(row);let at=ours.findIndex(x=>x.startsWith('|')&&x.includes(match[1]));if(at>=0)ours[at]=row;else{at=ours.findIndex(x=>x.startsWith('| [2026-10-03')||x.startsWith('| ./2026-10-03'));if(at<0)throw Error('No current research table');ours.splice(at,0,row);}}fs.writeFileSync(p,ours.join('\n'));git(['add',p]);git(['cherry-pick','--continue']);}
const picks=[
['f0d74f71e2922946877b1af1f5532d4d2c35f634',['2026-10-03-template-camera-preflight-coherence']],


['5c9f1019da94d5a32ea2c49b3f927a2c221df813',['2026-10-03-template-history-verdict']],
['e9b5206e56dfe2bc84e5e1eb7a93547cf2dadf5f',['2026-10-03-template-history-verdict']],
['f9f01a5ad8f2effb5c0890cae75f800fa6ae6166',['2026-10-03-prisoner-legacy-camera-audit']],
['9d2f7c8d38c597c3721bcfdbd9d97fbed20bcaac',['2026-10-03-guard-legacy-render-fit']],
['5546a64524e28178a33f6a251bf06ffc96678393',['2026-10-03-guard-legacy-render-fit']],
['2f8cc600876caecab4cc5c0772b01e0cf5927f9d',['2026-10-03-guard-legacy-render-fit']],
['12bde319ef615458592b67d1014c20ed348244d8',['2026-10-03-guard-legacy-render-fit']],
['138dfa0420875b70919434b5571549e10be1f79b',['2026-10-03-public-hired-guard-native-preparation']],
['96e384ff6f40ec8e307042643660fa571f00310d',['2026-10-03-public-hired-guard-native-preparation','2026-10-03-guard-rear-belt-connections']]];
if(git(['status','--porcelain']).stdout.trim())throw Error('Root must be clean before sequential integration');
for(const[sha,keys]of picks){const r=git(['cherry-pick',sha],true);if(r.status!==0)resolve(keys);process.stdout.write(git(['log','-1','--format=%h %s']).stdout);}

