const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd(),out=path.join(process.env.TEMP,'lockstate-world-native-control-20261003');
const source=path.join(root,'src/rendering/scene/world-scene.ts'),dist=path.join(root,'dist');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
if(path.basename(root)!=='lockstate-common-room-connectivity-integration-20261003'||!dist.startsWith(root+path.sep)||!out.startsWith(path.resolve(process.env.TEMP)+path.sep))throw Error('Wrong own paths');
const mode=process.argv[2];
if(mode==='prepare'||mode==='reprepare'){
 if(mode==='prepare'&&fs.existsSync(out))throw Error('Existing control backup must not be overwritten');
 if(mode==='reprepare'&&!fs.existsSync(out))throw Error('Original backup missing');
 fs.mkdirSync(out,{recursive:true});const bytes=fs.readFileSync(source);
 const needle=Buffer.from("      this.keyboard.releaseCodes(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);");
 const at=bytes.indexOf(needle);if(at<0||bytes.indexOf(needle,at+needle.length)>=0)throw Error('Ambiguous real producer');
 if(mode==='prepare'){
  fs.writeFileSync(path.join(out,'original-world-scene.ts'),bytes);
  fs.cpSync(dist,path.join(out,'original-dist'),{recursive:true});
 } else if(!bytes.equals(fs.readFileSync(path.join(out,'original-world-scene.ts'))))throw Error('Original source differs');
 const manifest=Object.fromEntries(files(dist).map(file=>[path.relative(dist,file),sha(fs.readFileSync(file))]));
 for(const [name,digest]of Object.entries(manifest))if(sha(fs.readFileSync(path.join(out,'original-dist',name)))!==digest)throw Error('Backup differs');
 if(mode==='prepare')fs.writeFileSync(path.join(out,'original-dist-hashes.json'),JSON.stringify(manifest,null,2));
 else if(JSON.stringify(manifest)!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(out,'original-dist-hashes.json'),'utf8'))))throw Error('Original manifest differs');
 const mutant=Buffer.concat([bytes.subarray(0,at),bytes.subarray(at+needle.length)]);fs.writeFileSync(source,mutant);
 fs.writeFileSync(path.join(out,'source-mutation.json'),JSON.stringify({originalSha256:sha(bytes),mutantSha256:sha(mutant),mutation:'omit only real World grouped-radio arrow release'},null,2));
 console.log('Backed up '+Object.keys(manifest).length+' actual compiled files; narrow real source omission applied');
}else if(mode==='restore'){
 const bytes=fs.readFileSync(path.join(out,'original-world-scene.ts')),manifest=JSON.parse(fs.readFileSync(path.join(out,'original-dist-hashes.json'),'utf8'));
 fs.writeFileSync(path.join(out,'negative-emitted-script-hashes.json'),JSON.stringify(Object.fromEntries(files(path.join(dist,'client/assets')).filter(f=>f.endsWith('.js')).map(f=>[path.relative(dist,f),sha(fs.readFileSync(f))])),null,2));
 fs.writeFileSync(source,bytes);
 // Remove only extra generated files created by this control in this own dist.
 for(const file of files(dist)){const relative=path.relative(dist,file);if(!Object.hasOwn(manifest,relative)){
  const absolute=path.resolve(file);if(!absolute.startsWith(dist+path.sep))throw Error('Extra generated path escaped own dist');fs.rmSync(absolute);
 }}
 fs.cpSync(path.join(out,'original-dist'),dist,{recursive:true,force:true});
 const actual=files(dist);if(actual.length!==Object.keys(manifest).length)throw Error('Restored file count differs');
 for(const file of actual)if(sha(fs.readFileSync(file))!==manifest[path.relative(dist,file)])throw Error('Restored compiled bytes differ: '+file);
 if(!fs.readFileSync(source).equals(bytes))throw Error('Source restoration differs');
 fs.writeFileSync(path.join(out,'exact-restoration.json'),JSON.stringify({sourceSha256:sha(bytes),compiledFiles:actual.length,allOriginalCompiledBytesRestored:true},null,2));
 console.log('EXACT source and all '+actual.length+' compiled files restored');
}else throw Error('Mode must be prepare or restore');
