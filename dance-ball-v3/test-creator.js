// Runs the actual installer, upload verification, catalogue store and bundled scripts.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const bundle=JSON.parse(fs.readFileSync(path.join(__dirname,'creator-package.json'),'utf8'));
assert(fs.statSync(path.join(__dirname,'creator-package.json')).size<256*1024,'Never parse the entire dance library as JS strings');
assert.equal(bundle.format,'sharded-gzip');assert(bundle.files.every(f=>!f.gzipBase64));
// Exercise the real HTML panel's actual button handlers without a desktop/viewer.
const html=bundle.files.find(f=>f.path==='menu.html').text;
const dom={},webMessages=[],model={title:'Dance Ball V3',message:'Choose a category.',token:9,buttons:[{label:'Single',value:'single'},{label:'Couple',value:'couple'}]};
vm.runInNewContext(html.split('<script>')[1].split('</script>')[0],{window:{EventBridge:true},EventBridge:{emitWebEvent:raw=>webMessages.push(JSON.parse(raw))},location:{hash:'#'+encodeURIComponent(JSON.stringify(model))},
 document:{getElementById:id=>dom[id]||(dom[id]={children:[],appendChild(x){this.children.push(x);}}),createElement:()=>({})}});
assert.deepEqual(dom.buttons.children.map(b=>b.textContent),['Single','Couple']);dom.buttons.children.forEach(b=>b.onclick());assert.deepEqual(webMessages,[{action:'select',value:'single',token:9},{action:'select',value:'couple',token:9}]);
const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:Buffer.from(x)).digest('hex');
const sentinel=Buffer.from('existing V1/V2 installation');
const settings={'danceBall.ballID':'v1-ball','danceBallV2.ballID':'v2-ball'};
const entityMap=new Map([['v1-ball',{name:'V1 untouched'}],['v2-ball',{name:'V2 untouched'}]]);
const storage=new Map(),mappings=new Map([['/dance-ball/catalogue.json',sha(sentinel)],['/dance-ball-v2/catalogue.json',sha(sentinel)]]);storage.set(sha(sentinel),sentinel);
let now=100000,seq=0,intervals=[],timeouts=[],stopped=false,alerts=[],logs=[],failUpload=false,corruptDownload=false,writePaths=[];
let work=[],decodes=0,maxDecodes=0,missingSource=false,corruptSource=false,rawBytes=0,modules=0;
const unrelated={id:'runtime-dependency'},parent={children:[unrelated]};
const signal=()=>({connect:()=>{},disconnect:()=>{}});
const bytes=x=>typeof x==='string'?Buffer.from(x):Buffer.from(x);
const api={print:m=>logs.push(m),Date:{now:()=>now},Settings:{getValue:(k,d)=>settings[k]||d,setValue:(k,v)=>settings[k]=v},
 Http:{createRequest:()=>{throw Error('Local binary HTTP reads fail with network error 301');}},
 XMLHttpRequest:function(){throw Error('Local binary HTTP reads fail with network error 301');},
 Window:{alert:m=>alerts.push(m)},
 MyAvatar:{position:{x:1,y:1,z:1},orientation:{x:0,y:0,z:0,w:1},scale:1},
 Quat:{fromPitchYawRollDegrees:()=>({x:0,y:0,z:0,w:1}),safeEulerAngles:()=>({y:0}),getForward:()=>({x:0,y:0,z:-1})},
 Vec3:{sum:(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}),multiply:(n,v)=>({x:n*v.x,y:n*v.y,z:n*v.z})},
 Entities:{canRez:()=>true,canWriteAssets:()=>true,findRayIntersection:()=>({intersects:true,distance:1,intersection:{y:0}}),
  addEntity:(p,scope)=>{const id='new-'+(++seq);assert.equal(scope,'domain');entityMap.set(id,JSON.parse(JSON.stringify(p)));return id;},
  editEntity:(id,p)=>{assert(!['v1-ball','v2-ball'].includes(id));Object.assign(entityMap.get(id),p);},getEntityProperties:id=>entityMap.get(id)||{},deleteEntity:id=>{assert(!['v1-ball','v2-ball'].includes(id));entityMap.delete(id);}},
 Assets:{hashDataHex:sha,decompressData:(o,done)=>{
   assert.equal(Object.keys(load.cache).length,0,'payload cache must be cleared before decoding');assert.deepEqual(parent.children,[unrelated]);
   decodes++;maxDecodes=Math.max(maxDecodes,decodes);assert.equal(decodes,1);const compressed=Buffer.from(o.data);
   work.push(()=>{const b=zlib.gunzipSync(compressed);rawBytes+=b.length;decodes--;done(null,{data:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});});
  },
  putAsset:(o,done)=>{writePaths.push(o.path);if(failUpload){done('simulated upload error');return;}const b=bytes(o.data),h=sha(b);storage.set(h,b);mappings.set(o.path,h);done(null);},
  getMapping:(p,done)=>mappings.has(p)?done(null,mappings.get(p)):done('Asset not found'),
  getAsset:(o,done)=>{let u=o.url.slice(4),h=u.startsWith('/')?mappings.get(u):u,b=storage.get(h);if(!b){done('Asset not found');return;}if(corruptDownload)b=Buffer.from('corrupt');done(null,{response:o.responseType==='text'?b.toString():b});}}
};
function load(name){
 if(name.startsWith('package-assets/')){
  assert.match(name,/^package-assets\/[a-f0-9]{64}\.json$/);assert.equal(Object.keys(load.cache).length,0);modules++;
  if(missingSource)throw Error('Missing payload module '+name);
  assert(fs.statSync(path.join(__dirname,name)).size<8*1024*1024);
  const packet=JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8'));
  if(corruptSource)packet.gzipBase64=zlib.gzipSync(Buffer.from('damaged payload')).toString('base64');
  const module={id:name,exports:packet,parent};load.cache[name]=module;parent.children.push(module);return packet;
 }
 name=path.basename(name);if(name==='creator-package.json')return bundle;const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,name),'utf8'),{...api,module});return module.exports;
}
load.resolve=name=>name;load.cache=Object.create(null);
api.Script={require:load,resolvePath:p=>p,setTimeout:(f,ms)=>{if(ms===0)work.push(f);else timeouts.push(f);return f;},clearTimeout:f=>timeouts=timeouts.filter(x=>x!==f),setInterval:f=>{intervals.push(f);return f;},clearInterval:f=>intervals=intervals.filter(x=>x!==f),stop:()=>stopped=true};
const beginInstall=()=>vm.runInNewContext(fs.readFileSync(path.join(__dirname,'install.js'),'utf8'),api);
const drain=()=>{while(work.length)work.shift()();};
const install=()=>{beginInstall();drain();};
install();assert(!stopped,'installer waits for independent server heartbeat');const ball=settings['danceBallV3.ballID'];assert(ball);
const p=entityMap.get(ball),meta=JSON.parse(p.userData).danceBallV3;
assert.match(p.name,/DarkRide Dance Ball V3/);assert.equal(p.lifetime,-1);assert.equal(p.position.y,1.2);assert.equal(meta.floor.y,0);assert.match(p.script,/^atp:\/dance-ball-v3\/releases\/v3-public-1-/);
assert(writePaths.every(p=>p.startsWith('/dance-ball-v3/')));
const cat=JSON.parse(storage.get(mappings.get('/dance-ball-v3/catalogue.json')).toString());assert.deepEqual(cat.dances.map(d=>d.id).sort(),bundle.entries.map(d=>d.id).sort());assert.equal(cat.dances.length,bundle.entries.length);
assert.equal(writePaths.at(-1),'/dance-ball-v3/catalogue.json');
const release=p.script.slice(4,p.script.lastIndexOf('/')+1);
for(const file of bundle.files){assert(mappings.has(release+file.path));assert.equal(mappings.get(release+file.path),file.sha256);}
for(const d of cat.dances){assert.match(d.manifest,/^atp:\/dance-ball-v3\/releases\//);if(d.notice)assert(mappings.has(d.notice.slice(4)));for(const part of d.parts)assert(storage.has(part.url.slice(4)));}
// Load each dependency from the uploaded namespace, rather than the source folder.
const remoteApi={...api,Messages:{subscribe:()=>{},messageReceived:signal()},Script:{...api.Script,resolvePath:f=>'atp:'+release+f,require:u=>remoteLoad(u)}};
function remoteLoad(u){const relative=u.slice(4),h=mappings.get(relative);assert(h,'Unresolved bundled dependency '+u);const text=storage.get(h).toString(),module={exports:{}};vm.runInNewContext(text,{...remoteApi,module});return module.exports;}
for(const f of ['catalogue-coordinator.js','catalogue-store.js','playback.js'])remoteLoad('atp:'+release+f);
for(const f of ['ball-client.js','ball-server.js']){const factory=vm.runInNewContext(storage.get(mappings.get(release+f)).toString(),remoteApi);const behavior={};factory.call(behavior);assert.equal(typeof behavior.preload,'function');}
meta.heartbeat=now;meta.epoch='live-server';entityMap.get(ball).userData=JSON.stringify({danceBallV3:meta});intervals.slice().forEach(f=>f());assert(!stopped,'wait until coordinator has a verified sender UUID');meta.coordinator='entity-script-server-session';entityMap.get(ball).userData=JSON.stringify({danceBallV3:meta});intervals.slice().forEach(f=>f());assert(stopped);assert(logs.at(-1).includes('READY'));assert.equal(entityMap.size,4);
assert.equal(settings['danceBallV2.ballID'],'v2-ball');assert.equal(settings['danceBall.ballID'],'v1-ball');assert.equal(mappings.get('/dance-ball/catalogue.json'),sha(sentinel));assert.equal(mappings.get('/dance-ball-v2/catalogue.json'),sha(sentinel));
now+=1000;stopped=false;install();assert.equal(entityMap.size,4,'reinstall reuses only V3 ball and label');
let updated=JSON.parse(entityMap.get(ball).userData).danceBallV3;updated.activeSessions=1;entityMap.get(ball).userData=JSON.stringify({danceBallV3:updated});let count=writePaths.length;install();assert.equal(writePaths.length,count);assert.match(alerts.at(-1),/active or waiting/);
// Failure must never rez or replace the existing catalogue.
updated.activeSessions=0;entityMap.get(ball).userData=JSON.stringify({danceBallV3:updated});const previous=mappings.get('/dance-ball-v3/catalogue.json');
failUpload=true;stopped=false;install();assert(stopped);assert.equal(mappings.get('/dance-ball-v3/catalogue.json'),previous);assert.equal(entityMap.size,4);failUpload=false;
corruptDownload=true;stopped=false;install();assert(stopped);assert.equal(mappings.get('/dance-ball-v3/catalogue.json'),previous);assert.match(alerts.at(-1),/verification failed/);
corruptDownload=false;
const hasPayload=bundle.files.some(f=>f.source);
if(hasPayload){
missingSource=true;stopped=false;install();assert(stopped);assert.equal(mappings.get('/dance-ball-v3/catalogue.json'),previous);assert.match(alerts.at(-1),/Missing payload module/);missingSource=false;
corruptSource=true;stopped=false;install();assert(stopped);assert.equal(mappings.get('/dance-ball-v3/catalogue.json'),previous);assert.match(alerts.at(-1),/Local package changed/);corruptSource=false;
// Watchdog while decompression is pending: its late callback cannot commit/re-rez.
stopped=false;beginInstall();while(work.length&&!decodes)work.shift()();assert.equal(decodes,1);timeouts.at(-1)();assert(stopped);const afterTimeout=writePaths.length;drain();assert.equal(writePaths.length,afterTimeout);assert.equal(mappings.get('/dance-ball-v3/catalogue.json'),previous);
assert.equal(maxDecodes,1);assert.equal(decodes,0);assert(modules>0);assert(rawBytes>0);
}
assert.equal(Object.keys(load.cache).length,0);assert.deepEqual(parent.children,[unrelated]);
console.log('V3 creator: empty or user-supplied catalogue, actual bytes, bounded JSON/cache loading, notices, catalogue-last, failure guards, readiness and unchanged V1/V2 resources passed. Simulation only.');
