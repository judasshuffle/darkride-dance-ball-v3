// Run once in the creator's viewer. Publishes V3 only, verifies, rezzes, then exits.
(function() {
    'use strict';
    var RELEASE = 'v3-public-1', finished = false, timer, watchdog;
    function log(m) { print('[DANCE BALL V3 ' + RELEASE + ' INSTALL] ' + m); }
    function end(error) {
        if (finished) return; finished = true;
        if (timer) Script.clearInterval(timer); if (watchdog) Script.clearTimeout(watchdog);
        log(error ? 'FAILED ' + error : 'READY: domain coordinator is running');
        Window.alert(error ? 'Dance Ball V3 setup failed: ' + error : 'Dance Ball V3 is ready. Click the floating V3 ball.'); Script.stop();
    }
    try {
        log('starting verified ATP publication');
        if (!Entities.canRez() || Entities.canWriteAssets && !Entities.canWriteAssets()) { end('Rez and asset-upload permissions are required.'); return; }
        var bundle = Script.require(Script.resolvePath('creator-package.json'));
        if (bundle.release !== RELEASE) throw Error('Creator package release mismatch. Rebuild the V3 package.');
        if (bundle.format !== 'sharded-gzip') throw Error('Rebuild the small-index V3 package.');
        log('small index loaded: entries=' + bundle.entries.length + ' files=' + bundle.files.length);
        var root = '/dance-ball-v3/releases/' + RELEASE + '-' + Date.now() + '/';
        var catalogue = 'atp:/dance-ball-v3/catalogue.json';
        var previous = Settings.getValue('danceBallV3.ballID',null), old;
        if (previous) { try { old = JSON.parse(Entities.getEntityProperties(previous,['userData']).userData).danceBallV3; } catch(ignore) {} }
        if (old && old.version !== 3) old = null;
        if (old && (old.activeSessions > 0 || old.state && old.state.sessions.length)) { end('The V3 ball has active or waiting sessions. Stop them before reinstalling.'); return; }
        var jobs = bundle.files.map(function(f) {
            var j = {path:root+f.path,sha256:f.sha256};
            if (typeof f.text === 'string') j.text = f.text;
            else {
                if (!/^package-assets\/[a-f0-9]{64}\.json$/.test(f.source)) throw Error('Invalid package source: ' + f.path);
                j.module = Script.resolvePath(f.source);
            }
            return j;
        });
        var entries = bundle.entries.map(function(d) {
            var e = JSON.parse(JSON.stringify(d)); e.manifest = 'atp:' + root + e.manifest;
            if (e.notice) e.notice = 'atp:' + root + e.notice;
            if (e.mannequin) e.mannequin = 'atp:' + root + e.mannequin; return e;
        });
        function rez() {
            if (finished) return;
            var facing = old ? old.facing : Quat.fromPitchYawRollDegrees(0,Quat.safeEulerAngles(MyAvatar.orientation).y,0);
            var floor = old ? old.floor : Vec3.sum(MyAvatar.position,Vec3.multiply(2,Quat.getForward(facing)));
            if (!old) {
                var hit = Entities.findRayIntersection({origin:Vec3.sum(floor,{x:0,y:1,z:0}),direction:{x:0,y:-1,z:0}},true);
                floor.y = hit.intersects && hit.distance < 5 ? hit.intersection.y : MyAvatar.position.y-bundle.targetPelvisHeight*MyAvatar.scale;
            }
            var label = old && old.label || Entities.addEntity({type:'Text',name:'DarkRide V3 launcher label',position:Vec3.sum(floor,{x:0,y:1.6,z:0}),
                dimensions:{x:2.8,y:.3,z:.01},text:'Dance Ball V3 | Single or Couple',lineHeight:.085,billboardMode:'full',backgroundAlpha:.65,collisionless:true,lifetime:-1},'domain');
            var properties = {type:'Shape',shape:'Sphere',name:'DarkRide Dance Ball V3 — ' + RELEASE,
                position:Vec3.sum(floor,{x:0,y:1.2,z:0}),rotation:facing,dimensions:{x:.3,y:.3,z:.3},
                color:{red:160,green:90,blue:245},collisionless:true,dynamic:false,lifetime:-1,
                script:'atp:' + root + 'ball-client.js',serverScripts:'atp:' + root + 'ball-server.js',
                userData:JSON.stringify({danceBallV3:{version:3,release:RELEASE,label:String(label),catalogue:catalogue,
                    menu:'atp:' + root + 'menu.html',floor:floor,facing:facing,targetPelvisHeight:bundle.targetPelvisHeight}})};
            var ball = old ? previous : Entities.addEntity(properties,'domain');
            if (!ball || /00000000-0000-0000-0000-000000000000/.test(String(ball))) { Entities.deleteEntity(label); end('Domain rez failed'); return; }
            if (old) Entities.editEntity(ball,properties);
            Entities.editEntity(label,{parentID:ball,localPosition:{x:0,y:.4,z:0}});
            Settings.setValue('danceBallV3.ballID',String(ball));
            log('published root=atp:' + root + ' catalogue=' + catalogue + ' launcher=' + ball);
            var waiting = Date.now();
            timer = Script.setInterval(function() {
                var m; try { m = JSON.parse(Entities.getEntityProperties(ball,['userData']).userData).danceBallV3; } catch(e) { return; }
                if (m && m.release === RELEASE && m.epoch && m.coordinator && Date.now()-m.heartbeat < 5000) end();
                else if (Date.now()-waiting > 20000) end('V3 launcher has no server heartbeat. Check the domain entity-script-server assignment.');
            },500);
        }
        var singleCount = entries.filter(function(e) { return e.parts.length === 1; }).length;
        Window.alert('Dance Ball V3 ' + RELEASE + ' is uploading and verifying ' + singleCount + ' Single and ' + (entries.length-singleCount) + ' Couple dances. This larger library may take several minutes. Wait for Ready.');
        watchdog = Script.setTimeout(function() { end('Upload timed out; no success recorded.'); },1200000);
        Script.require(Script.resolvePath('publish-runner.js'))({files:jobs,entries:entries,catalogue:catalogue,
            cancelled:function() { return finished; },
            progress:function(n,total,path) { log('upload ' + n + '/' + total + ' ' + path); }
        },function(error) { if(error) end(error); else rez(); });
    } catch(e) { end(String(e)); }
}());
