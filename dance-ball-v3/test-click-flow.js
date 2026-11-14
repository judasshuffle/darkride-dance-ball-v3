// Actual attached client/server, clickable panel and playback, in independent viewer VMs.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
function signal(){let f=[];return{connect:x=>f.push(x),disconnect:x=>f=f.filter(y=>x!==y),emit:(...a)=>f.slice().forEach(x=>x(...a)),count:()=>f.length};}
const clone=x=>JSON.parse(JSON.stringify(x));
const yaw=d=>({x:0,y:Math.sin(d*Math.PI/360),z:0,w:Math.cos(d*Math.PI/360)});
const mul=(a,b)=>({x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z});
const rotate=(q,v)=>{let p=mul(mul(q,{...v,w:0}),{x:-q.x,y:-q.y,z:-q.z,w:q.w});return{x:p.x,y:p.y,z:p.z};};
const sum=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}),sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
let now=100000,seq=0,server,entities=new Map(),clients=[],manifests=[],held=[],published={state:{sessions:[]}},maxStateBytes=0,maxPropertyBytes=0;
function propertyLimit(p){if(p.userData){const size=Buffer.byteLength(p.userData);maxPropertyBytes=Math.max(maxPropertyBytes,size);assert(size<=1330,'DarkRide rejects userData above 1330 bytes: '+size);}}
const foxtrot={id:'f',revision:'r1',name:'Foxtrot',manifest:'atp:/dance-ball-v3/releases/test/dance/playback.json',referenceHeight:1.9373138174414635,periodSeconds:3,parts:[{role:'leader',label:'Lead',dancerIndex:0,file:'lead.fbx'},{role:'follower',label:'Follow',dancerIndex:1,file:'follow.fbx'}]};
const ballet={id:'s',revision:'r2',name:'Ballet',manifest:'atp:/dance-ball-v3/releases/test/solo/playback.json',periodSeconds:3,parts:[{role:'dancer',dancerIndex:0,file:'solo.fbx'}]};
let catalogue={dances:[foxtrot,ballet]};
let actualManifests=null;
function clip(role,offset){return{role,frames:4,fps:1,durationSeconds:3,rootPositions:[[offset,1,2],[offset+1,1,2],[offset+2,1,2],[offset+3,1,2]]};}
const pairManifest={dancers:[clip('leader',3),clip('follower',4)]},soloManifest={dancers:[clip('dancer',0)]};
entities.set('launcher',{userData:JSON.stringify({danceBallV3:{version:3,release:'v3-public-1',catalogue:'atp:/dance-ball-v3/catalogue.json',menu:'atp:/dance-ball-v3/releases/test/menu.html',floor:{x:0,y:0,z:0},facing:yaw(0),targetPelvisHeight:1}})});
const state=()=>published.state.sessions;
function environment(id,tabletMode=false){
 const mouse=signal(),clickSignal=signal(),received=signal(),update=signal(),domainChanged=signal(),intervals=[],overlays=new Map(),logs=[],sent=[],local=new Map(),resources=[],tabletEvents=signal(),screens=[];
 const avatar={sessionUUID:{toString:()=>id},displayName:'Same display name',position:{x:10+clients.length*10,y:1,z:10},orientation:yaw(0),scale:id==='C'?1.25:1,collisionsEnabled:true,getHeight:()=>env.height*avatar.scale,
  getJointIndex:()=>0,getAbsoluteDefaultJointTranslationInObjectFrame:()=>env.hips||({x:0,y:1,z:0}),getJointRotations:()=>[yaw(0)],setJointRotations:()=>{throw Error('World scripts must use native playback');},clearJointsData:()=>avatar.cleared++,restoreAnimation:()=>avatar.restored++,overrideAnimation:(...a)=>{avatar.animation=a;avatar.animationAt=now;},cleared:0,restored:0};
 const original=clone({position:avatar.position,orientation:avatar.orientation,scale:avatar.scale,collisionsEnabled:avatar.collisionsEnabled});
 const api={Date:{now:()=>now},print:s=>logs.push(s),MyAvatar:avatar,Vec3:{sum,subtract:sub,multiply:(n,v)=>({x:n*v.x,y:n*v.y,z:n*v.z}),multiplyQbyV:rotate},
  Quat:{safeEulerAngles:()=>({y:0}),fromPitchYawRollDegrees:(x,y)=>yaw(y),getForward:()=>({x:0,y:0,z:-1}),multiply:mul,slerp:(a,b,w)=>({x:0,y:a.y+(b.y-a.y)*w,z:0,w:1})},
  Controller:{mousePressEvent:mouse,getViewportDimensions:()=>({x:1000,y:700})},
  Overlays:{addOverlay:(kind,p)=>{const id='overlay-'+(++seq);overlays.set(id,p);return id;},deleteOverlay:id=>overlays.delete(id)},
  Window:{domainChanged,alert:m=>{throw Error('Guests must use clickable panels, no dialogs: '+m);}},
  AvatarList:{getAvatarIdentifiers:()=>{throw Error('No avatar picker or display-name lookup');}},
  Entities:{clickDownOnEntity:clickSignal,getEntityProperties:entity=>entities.get(String(entity))||{},
   findRayIntersection:()=>({intersects:true,distance:1,intersection:{y:0}}),
   addEntity:(p,scope)=>{propertyLimit(p);assert.notEqual(scope,'local','no local Woody/mannequin may be spawned');assert.notEqual(p.type,'Text','pose balls must have no floating text');const eid='entity-'+(++seq);entities.set(eid,clone(p));return eid;},
   editEntity:(eid,p)=>{propertyLimit(p);let map=local.has(eid)?local:entities;if(map.has(eid))Object.assign(map.get(eid),clone(p));},
   deleteEntity:eid=>{local.delete(eid);entities.delete(eid);}},
  AnimationCache:{prefetch:url=>{const r={state:env.loadState||3,url};resources.push(r);return r;},getAnimation:()=>{throw Error('AnimationWrapper is for private scripts; world script denied');}},
  Assets:{getAsset:(o,done)=>{manifests.push(o.url);const callback=()=>done(null,{response:actualManifests?actualManifests.get(o.url):JSON.stringify(o.url.includes('/solo/')?soloManifest:pairManifest)});if(env.holdManifest)held.push(callback);else callback();}},
  Messages:{subscribe:()=>{},unsubscribe:()=>{},messageReceived:received,sendMessage:(ch,raw,localOnly)=>{
   const m=JSON.parse(raw);sent.push(m);
   if(localOnly){received.emit(ch,raw,{toString:()=>id},true);return;}
   if(id==='server'&&m.type==='state'){published=m;maxStateBytes=Math.max(maxStateBytes,Buffer.byteLength(raw));}
   server.received.emit(ch,raw,{toString:()=>id},false);clients.forEach(c=>c.received.emit(ch,raw,{toString:()=>id},false));
  }}
 };
 if(tabletMode)api.Tablet={getTablet:()=>({webEventReceived:tabletEvents,gotoHomeScreen:()=>{},gotoWebScreen:u=>screens.push(JSON.parse(decodeURIComponent(u.split('#')[1])))})};
 function load(file){if(file==='catalogue-store.js')return{load:(url,done)=>done(null,catalogue)};const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,file),'utf8'),{...api,module});return module.exports;}
 api.Script={require:load,resolvePath:p=>p,setInterval:f=>{intervals.push(f);return f;},clearInterval:f=>{const i=intervals.indexOf(f);if(i>=0)intervals.splice(i,1);},update};
 const behavior={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,id==='server'?'ball-server.js':'ball-client.js'),'utf8'),api).call(behavior);
 const env={...api,behavior,mouse,received,intervals,overlays,logs,sent,local,resources,avatar,original,tabletEvents,screens,holdManifest:false,height:id==='B'?2.2:1.5,
  poll:()=>intervals.slice().forEach(f=>f()),frame:()=>update.emit(),click(entity){now+=1000;clickSignal.emit(entity,{isPrimaryButton:true});},
  button(text){now+=200;if(tabletMode){const screen=screens.at(-1),b=screen.buttons.find(b=>b.label===text);assert(b,'Expected Tablet button '+text);tabletEvents.emit(JSON.stringify({token:screen.token,action:b.action||'select',value:b.value}));return;}
   const row=[...overlays.values()].find(p=>p.text===text);assert(row,'Expected button '+text+'; visible '+[...overlays.values()].map(p=>p.text));mouse.emit({x:row.x+10,y:row.y+10,isPrimaryButton:true});},
  texts:()=>tabletMode?[screens.at(-1)?.message,...(screens.at(-1)?.buttons||[]).map(b=>b.label)]:[...overlays.values()].map(p=>p.text)};
 return env;
}
server=environment('server');server.behavior.preload('launcher');
for(const id of ['A','B','C','D','E']){const c=environment(id,id==='E');clients.push(c);c.behavior.preload('launcher');}
const [A,B,C,D,E]=clients;
A.hips=B.hips=E.hips={x:0,y:0,z:0}; // Real shipped viewer reports Hips offset zero.
const initialSnapshot=clone(published);
function poll(){server.poll();clients.forEach(c=>c.poll());}
function spawn(c,mode='Couple',match=false){c.click('launcher');assert.deepEqual(c.texts().filter(x=>x==='Single'||x==='Couple'),['Single','Couple']);c.button(mode);if(mode==='Couple')c.button(match?'Match dance height':'Keep current sizes');poll();return state().find(s=>s.owner===String(c.avatar.sessionUUID));}
function role(c,s,r){const fresh=state().find(x=>x.id===s.id),ball=fresh.balls[r];assert(ball);c.click(ball);poll();assert(!entities.has(ball),'claimed pose ball disappears');assert(!state().find(x=>x.id===s.id).balls[r]);return ball;}
function waitStart(s){poll();poll();const fresh=state().find(x=>x.id===s.id);assert(fresh.start);now=Math.max(now,fresh.start);poll();clients.forEach(c=>c.frame());return fresh;}
function restored(c){assert.deepEqual(clone({position:c.avatar.position,orientation:c.avatar.orientation,scale:c.avatar.scale,collisionsEnabled:c.avatar.collisionsEnabled}),c.original);assert.equal(c.local.size,0);}
let s=spawn(A);assert.equal(s.participants.length,0);assert.equal(Object.keys(s.balls).length,2);
const oldFollow=role(B,s,'follow');assert(B.texts().some(t=>t.startsWith('Waiting for lead to choose a dance')));assert(state()[0].balls.lead,'unclaimed Lead remains');
const oldLead=role(A,s,'lead');assert(A.texts().includes('Foxtrot'));assert.equal(Object.keys(state()[0].balls).length,0);
A.Entities.clickDownOnEntity.emit(oldLead,{isPrimaryButton:true});poll();assert.equal(state().length,1,'double-click must not toggle Stop');
now+=1000;A.Entities.clickDownOnEntity.emit(oldLead,{isPrimaryButton:true});poll();assert.equal(state().length,1,'late click on consumed ball cannot stop');
B.loadState=1;A.button('Foxtrot');poll();
// A ready client alone cannot start the pair.
B.resources.forEach(r=>r.state=1);poll();assert.equal(state()[0].start,0);B.resources.forEach(r=>r.state=3);B.loadState=3;
s=waitStart(s);assert.equal(A.local.size,0);assert.equal(B.local.size,0);assert(A.avatar.animation&&B.avatar.animation);
assert.equal(A.avatar.position.y,1,'zero-offset avatar origin must be raised by authored hip height above the floor');
assert.equal(B.avatar.position.y,1);
// Reordered snapshots and a different sender cannot stop an occupied session.
A.received.emit('darkride.dance.v3.launcher',JSON.stringify(initialSnapshot),{toString:()=> 'server'},false);
A.received.emit('darkride.dance.v3.launcher',JSON.stringify({...published,seq:published.seq+100,state:{sessions:[]}}),{toString:()=> 'unrelated-viewer'},false);
A.poll();assert.equal(A.avatar.restored,0);
const start=s.start;for(const elapsed of [500,3500,6500]) {now=start+elapsed;poll();A.frame();B.frame();for(const c of [A,B])assert(Math.abs(c.avatar.animation[3]+(now-c.avatar.animationAt)/1000-(elapsed/1000)%3)<1e-8,'both native avatars share UTC phase');assert(Math.abs(A.avatar.position.x-B.avatar.position.x-1)<1e-8,'authored one metre offset preserved');}
B.click(oldFollow);poll();assert.equal(state().length,1,'consumed Follow ball is not a Stop control');
C.click('launcher');assert(C.texts().includes('Single'));assert.equal(state().length,1,'bystander main click opens menu, cannot stop pair');
B.click('launcher');poll();assert.equal(state().length,0);restored(A);restored(B);assert(entities.has('launcher'));
// Lead first and two Judas viewers: identity is exclusively session UUID.
s=spawn(A);role(A,s,'lead');A.button('Foxtrot');poll();assert(A.texts().some(t=>t.startsWith('Waiting for partner')));
const before=state()[0];const epoch=JSON.parse(entities.get('launcher').userData).danceBallV3.epoch;
const claim=(sender,request)=>server.received.emit('darkride.dance.v3.launcher',JSON.stringify({type:'claim',epoch,sessionId:s.id,role:'follow',requestId:request}),{toString:()=>sender});
claim('B','race-B');claim('C','race-C');poll();assert.deepEqual(state()[0].participants.map(p=>p.id),['A','B']);
const second=spawn(C);role(C,second,'lead');C.button('Foxtrot');poll();role(D,second,'follow');
s=waitStart(s);let s2=state().find(x=>x.id===second.id);now=Math.max(s.start,s2.start);poll();clients.forEach(c=>c.frame());assert.equal(A.local.size+B.local.size+C.local.size+D.local.size,0);assert.equal(state().length,2);
assert.equal(C.avatar.scale,1.25,'Keep current sizes must preserve a pre-existing avatar scale');
// Double clicks cannot toggle a newly acquired role or start a second dance.
assert.equal(A.logs.filter(l=>l.includes('start session='+s.id)).length,1);
A.click('launcher');poll();assert.equal(state().length,1);assert.equal(state()[0].id,second.id);restored(A);restored(B);assert.equal(C.avatar.restored,0);
// Disconnect: the absent partner stops pulsing, both temporary balls and local models clear.
const active=state()[0],dPart=active.participants.find(p=>p.id==='D');
for(let i=0;i<9;i++){now+=1000;server.poll();C.poll();C.frame();}D.poll();assert.equal(state().length,0);restored(C);restored(D);
// Solo with Tablet actual-button path and restoration.
E.avatar.collisionsEnabled=false; // Stop must explicitly enable world collisions, even if previously off.
let solo=spawn(E,'Single');const oldSolo=role(E,solo,'solo');E.button('Ballet');poll();solo=waitStart(solo);assert(E.avatar.animation);assert.equal(E.avatar.collisionsEnabled,false);now=solo.start+6500;poll();E.frame();assert(state().length);E.click(oldSolo);poll();assert(state().length);E.click('launcher');poll();restored(E);assert.equal(E.avatar.collisionsEnabled,true);
// The main menu owns height matching; unequal avatars temporarily reach the reference height.
s=spawn(A,'Couple',true);assert.equal(s.matchHeight,true);role(A,s,'lead');assert(!A.texts().includes('Match dance height'));A.button('Foxtrot');poll();role(B,s,'follow');s=waitStart(s);assert(Math.abs(A.avatar.getHeight()-foxtrot.referenceHeight)<1e-8);assert(Math.abs(B.avatar.getHeight()-foxtrot.referenceHeight)<1e-8);assert.notEqual(A.avatar.scale,B.avatar.scale);B.click('launcher');poll();restored(A);restored(B);
// Empty state is clickable and Back cancels the temporary ball.
catalogue={dances:[foxtrot]};solo=spawn(A,'Single');role(A,solo,'solo');assert(A.texts().includes('No single dances available yet'));A.button('Back');poll();assert.equal(state().length,0);catalogue={dances:[foxtrot,ballet]};
// Late manifest completion after Stop cannot fail, start or stop a replacement session.
A.holdManifest=true;s=spawn(A);role(A,s,'lead');A.button('Foxtrot');poll();assert(held.length);now+=1600;A.click('launcher');poll();A.holdManifest=false;
solo=spawn(A,'Single');role(A,solo,'solo');A.button('Ballet');poll();held.splice(0).forEach(f=>f());poll();assert.equal(state()[0].id,solo.id);assert.equal(state()[0].dance.name,'Ballet');solo=waitStart(solo);
// Launcher heartbeat loss restores locally; server recovery/expiry is independent.
now+=8001;A.poll();restored(A);server.poll();poll();assert.equal(state().length,0);
// A requester can cancel from the main ball before claiming Lead, even if Follow joined.
s=spawn(A);role(B,s,'follow');A.click('launcher');poll();assert.equal(state().length,0);
s=spawn(B);B.click('launcher');poll();assert.equal(state().length,0);
// Waiting and unclaimed sessions clean up when owner disappears.
s=spawn(B);now+=8001;server.poll();assert.equal(state().length,0);
catalogue={dances:[]};s=spawn(A);role(A,s,'lead');assert(A.texts().includes('No couple dances available yet'));A.button('Back');poll();assert.equal(state().length,0);
clients.forEach(c=>{c.behavior.unload();assert.equal(c.mouse.count(),0);assert.equal(c.Entities.clickDownOnEntity.count(),0);assert.equal(c.Script.update.count(),0);assert.equal(c.tabletEvents.count(),0);assert.equal(c.received.count(),0);assert.equal(c.local.size,0);assert.equal(c.overlays.size,0);});
server.behavior.unload();
assert(manifests.every(u=>u.startsWith('atp:/dance-ball-v3/')));
assert(clients.every(c=>c.sent.every(m=>!['invite','inviteResponse','joinGroup'].includes(m.type))));
assert(maxStateBytes>1330,'regression must exercise snapshots larger than one entity property');
assert(maxPropertyBytes<=1330);assert(!JSON.parse(entities.get('launcher').userData).danceBallV3.state,'full snapshots must never enter launcher userData');
console.log('Real property-size regression passed: largest snapshot='+maxStateBytes+' bytes; largest userData='+maxPropertyBytes+' bytes.');
console.log('Actual V3 scripts: no mannequin or pose labels, each ball consumed on claim, main-ball-only Stop with pair isolation, main-menu height choice and size restoration, both join orders, role races, UTC loops, floor, disconnect, Solo, callbacks and reuse passed. Simulation only.');
