(function() {
    'use strict';
    var RELEASE = 'v3-public-1', id, meta, machine, timer, channel, ending = false, entities = {}, previous = {}, sequence = 0, probe;
    function log(m) { print('[DANCE BALL V3 ' + RELEASE + ' SERVER] ' + m); }
    function destroy(set) { Object.keys(set).forEach(function(k) { Entities.deleteEntity(set[k]); }); }
    function poseBalls(s) {
        var set = {}, roles = s.mode === 'single' ? ['solo'] : ['lead','follow'];
        try { roles.forEach(function(role, index) {
            var offset = s.mode === 'single' ? 0 : (index === 0 ? -.3 : .3);
            var position = Vec3.sum(s.anchor.position, Vec3.multiplyQbyV(s.anchor.facing, {x:offset,y:.22,z:0}));
            var ball = Entities.addEntity({type:'Shape',shape:'Sphere',name:'DarkRide V3 ' + (role === 'solo' ? 'Single' : role === 'lead' ? 'Lead' : 'Follow') + ' ' + s.id,
                position:position,dimensions:{x:.25,y:.25,z:.25},color:role === 'follow' ? {red:240,green:120,blue:190} : {red:60,green:210,blue:240},
                collisionless:true,dynamic:false,lifetime:30,userData:JSON.stringify({danceBallV3Pose:{launcher:String(id),sessionId:s.id,role:role,epoch:meta.epoch}})}, 'domain');
            if (!ball || /00000000-0000-0000-0000-000000000000/.test(String(ball))) throw Error('Pose ball rez failed');
            set[role] = String(ball);
        }); } catch(e) { destroy(set); throw e; } return set;
    }
    function publish() {
        if (ending) return;
        var state = machine.state(), alive = {};
        state.sessions.forEach(function(s) {
            alive[s.id] = true;
            if (!entities[s.id]) {
                try { entities[s.id] = poseBalls(s); log('spawn ' + s.id + ' owner=' + s.owner + ' mode=' + s.mode); }
                catch(e) { log(String(e)); machine.remove(s.owner); return; }
            }
            // Consume only the claimed role's ball. An unclaimed partner ball
            // stays available; a consumed ball must never be re-created.
            s.participants.forEach(function(p) {
                if (entities[s.id][p.role]) { Entities.deleteEntity(entities[s.id][p.role]); delete entities[s.id][p.role]; }
            });
            s.balls = entities[s.id];
            var lifetime = (Date.now()-s.created)/1000 + 30;
            Object.keys(s.balls).forEach(function(k) { Entities.editEntity(s.balls[k], {lifetime:lifetime}); });
            if (s.start && previous[s.id] !== s.start) { previous[s.id] = s.start; log('start ' + s.id + ' utc=' + s.start + ' roles=' + JSON.stringify(s.participants)); }
        });
        Object.keys(entities).forEach(function(k) { if (!alive[k]) { destroy(entities[k]); delete entities[k]; delete previous[k]; log('cleanup ' + k); } });
        // Omit a failed rez immediately, rather than replicating a session with no balls.
        state.sessions = state.sessions.filter(function(s) { return !!entities[s.id]; });
        // DarkRide refuses a userData property above 1330 bytes. Full snapshots
        // travel via reliable multipart Messages, never through entity properties.
        delete meta.state; meta.activeSessions = state.sessions.length; meta.heartbeat = Date.now();
        Entities.editEntity(id, {userData:JSON.stringify({danceBallV3:meta})});
        if (meta.label) Entities.editEntity(meta.label, {text:'Dance Ball V3 | Click for Single or Couple'});
        Messages.sendMessage(channel, JSON.stringify({type:'state',epoch:meta.epoch,seq:++sequence,release:RELEASE,state:state}),false);
    }
    function message(ch, raw, sender, localOnly) {
        if (ending || ch !== channel) return;
        var m; try { m = JSON.parse(raw); } catch(e) { return; }
        if (m.epoch !== meta.epoch) return;
        sender = String(sender);
        // A local-only echo discovers this entity server's authenticated sender
        // UUID without depending on an Agent/MyAvatar API in server scripts.
        if (m.type === 'coordinatorProbe' && localOnly === true && m.probe === probe) { meta.coordinator = sender; return; }
        if (m.type === 'state' || m.type === 'coordinatorProbe') return;
        if (m.type === 'getState') { publish(); return; }
        // Never trust a dance object supplied by a client. Resolve and pin the catalogue entry.
        delete m.dance;
        if (m.type === 'choose') {
            Script.require(Script.resolvePath('catalogue-store.js')).load(meta.catalogue, function(e, c) {
                if (ending || e) { log('catalogue failed ' + e); return; }
                m.dance = (c.dances || []).filter(function(d) { return d.id === m.id; })[0];
                machine.receive(sender, m, Date.now()); publish();
            });
        } else {
            machine.receive(sender, m, Date.now());
            // Heartbeat messages update the machine; the 500 ms publisher sends
            // one snapshot, avoiding a broadcast echo for every participant pulse.
            if (['ownerPulse','pulse','ready'].indexOf(m.type) < 0) publish();
        }
        if (['spawn','claim','choose','stop','leave','cancel'].indexOf(m.type) >= 0) log('receive ' + m.type + ' sender=' + sender + ' session=' + (m.sessionId || '') + ' role=' + (m.role || ''));
    }
    this.preload = function(entityID) {
        id = entityID; meta = JSON.parse(Entities.getEntityProperties(id, ['userData']).userData).danceBallV3;
        // A restarted entity server removes only V3 temporary entities from its old epoch.
        ((meta.state || {}).sessions || []).forEach(function(s) { if (s.balls) destroy(s.balls); });
        meta.epoch = RELEASE + '-' + Date.now() + '-' + Math.random();
        channel = 'darkride.dance.v3.' + id;
        machine = Script.require(Script.resolvePath('catalogue-coordinator.js'))(5000,8000,30000,120000);
        Messages.subscribe(channel); Messages.messageReceived.connect(message);
        probe = meta.epoch + ':' + Math.random();
        Messages.sendMessage(channel,JSON.stringify({type:'coordinatorProbe',epoch:meta.epoch,probe:probe}),true);
        delete meta.state;
        timer = Script.setInterval(function() { machine.tick(Date.now()); publish(); },500);
        log('launcher=' + id + ' epoch=' + meta.epoch + ' channel=' + channel); publish();
    };
    this.unload = function() {
        ending = true; Object.keys(entities).forEach(function(k) { destroy(entities[k]); });
        Script.clearInterval(timer); Messages.messageReceived.disconnect(message); Messages.unsubscribe(channel);
    };
});
