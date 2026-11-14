const assert = require('node:assert/strict');
const create = require('./catalogue-coordinator');
const anchor = {position:{x:10,y:0,z:20},hips:{x:0,y:1,z:0},facing:{x:0,y:0,z:0,w:1}};
const dance = {id:'f',revision:'r1',manifest:'atp:/dance-ball-v3/f',parts:[{role:'leader',label:'Lead'},{role:'follower',label:'Follow'}],periodSeconds:3};
let now=1000, n=0;
const machine=create(5000,8000,30000,120000), state=()=>machine.state().sessions;
const send=(id,m)=>machine.receive(id,{sentAt:now,...m},now);
function spawn(id,mode='couple') {send(id,{type:'spawn',mode,anchor,requestId:'spawn-'+(++n)});return state().find(s=>s.owner===id);}
function claim(id,s,role) {let token='claim-'+(++n);send(id,{type:'claim',sessionId:s.id,role,requestId:token});return token;}
function act(id,s,token,type,extra={}) {send(id,{type,sessionId:s.id,claim:token,...extra});}
for (const followFirst of [true,false]) {
 const s=spawn('A'), a=followFirst?null:claim('A',s,'lead');let b,aa=a;
 if(followFirst) {b=claim('B',s,'follow');assert.equal(state()[0].status,'Waiting for lead to choose a dance');aa=claim('A',s,'lead');}
 act('A',s,aa,'choose',{dance});
 if(!followFirst) {assert.equal(state()[0].status,'Waiting for partner');b=claim('B',s,'follow');}
 act('A',s,aa,'ready',{revision:'wrong'});act('B',s,b,'ready',{revision:'r1'});assert.equal(state()[0].start,0);
 act('A',s,'wrong-claim','ready',{revision:'r1'});assert.equal(state()[0].start,0);
 act('A',s,aa,'ready',{revision:'r1'});const start=state()[0].start;assert.equal(start,now+5000);
 now+=200;act('A',s,aa,'ready',{revision:'r1'});assert.equal(state()[0].start,start);
 act('C',s,b,'stop');assert.equal(state().length,1);act('B',s,b,'stop');assert.equal(state().length,0);
}
let s=spawn('A');const a=claim('A',s,'lead');
const b=claim('B',s,'follow');claim('C',s,'follow');claim('B',s,'follow');claim('A',s,'follow');
assert.deepEqual(state()[0].participants.map(p=>p.id),['A','B'],'racing/duplicate/second-role claims are inert');
const other=spawn('D'),d=claim('D',other,'lead'),e=claim('E',other,'follow');
act('A',s,a,'choose',{dance});act('D',other,d,'choose',{dance});
for(const [id,ss,t] of [['A',s,a],['B',s,b],['D',other,d],['E',other,e]]) act(id,ss,t,'ready',{revision:'r1'});
assert.equal(state().length,2);const otherStart=state()[1].start;
act('A',other,a,'stop');assert.equal(state().length,2);
act('A',s,a,'stop');assert.equal(state()[0].start,otherStart);
const replacement=spawn('A'),a2=claim('A',replacement,'lead');
act('A',s,a,'stop');act('A',s,a,'ready',{revision:'r1'});act('A',s,a,'choose',{dance});
assert.equal(state().length,2);assert.equal(state().find(x=>x.id===replacement.id).dance,null,'late messages cannot target replacement');
act('A',replacement,a2,'leave');assert.equal(state().length,1);
now+=8001;machine.tick(now);assert.equal(state().length,0,'disconnect cleans pair');
s=spawn('A');const first=state().length;send('A',{type:'spawn',mode:'single',anchor,requestId:'extra'});assert.equal(state().length,first);
send('A',{type:'cancel',sessionId:s.id});assert.equal(state().length,0);
send('A',{type:'spawn',sentAt:now-11000,mode:'single',anchor,requestId:'stale'});assert.equal(state().length,0);
send('A',{type:'spawn',mode:'single',anchor:{...anchor,position:{x:NaN,y:0,z:0}},requestId:'invalid'});assert.equal(state().length,0);
s=spawn('A','single');const solo=claim('A',s,'solo');act('A',s,solo,'choose',{dance:{...dance,parts:[{role:'dancer'}]}});act('A',s,solo,'ready',{revision:'r1'});assert(state()[0].start);
for(let i=0;i<4;i++) {now+=4000;act('A',s,solo,'pulse');machine.tick(now);}assert.equal(state().length,1,'loop never naturally releases');
act('A',s,solo,'stop');
s=spawn('A');now+=120001;send('A',{type:'ownerPulse',sessionId:s.id});machine.tick(now);assert.equal(state().length,0,'abandoned empty balls expire even with owner heartbeat');
console.log('V3 coordinator: both join orders, exact wait states, two-session isolation, role races, distinct sessions, stale/duplicate messages, readiness, one UTC start, loop, stop, cancel, disconnect, abandonment and reuse passed.');
