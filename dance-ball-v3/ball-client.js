(function() {
    'use strict';
    var RELEASE = 'v3-public-1', id, channel, meta, epoch, timer, closed = false, sequence = 0;
    var snapshot = null, lastSequence = 0, lastStateAt = 0, lastRequest = 0, refreshError = '';
    var player, resource, data, clip, url, session, participant, prepared = '', ready = false, loadedAt = 0, danceScale = 1;
    var lastHeartbeat = 0, lastChange = 0, menuClaim = '', pendingMenu = '', panelVersion = 0, view = '', clickTimes = {};
    var overlays = [], buttons = [], rects = [], overlayDone, desktopConnected = false, tablet, tabletConnected = false, panelDone;
    var makePlayer = Script.require(Script.resolvePath('playback.js'));
    function log(m) { print('[DANCE BALL V3 ' + RELEASE + ' CLIENT] self=' + me() + ' ' + m); }
    function me() { return String(MyAvatar.sessionUUID); }
    function nonce() { return me() + ':' + Date.now() + ':' + (++sequence); }
    function send(type, extra) {
        if (closed || !meta || !epoch) return;
        var m = {type:type,epoch:epoch,sentAt:Date.now()}; Object.keys(extra || {}).forEach(function(k) { m[k] = extra[k]; });
        if (['pulse','ready','ownerPulse'].indexOf(type) < 0) log('send ' + JSON.stringify(m));
        Messages.sendMessage(channel, JSON.stringify(m), false);
    }
    function clearPanel() {
        overlays.forEach(function(x) { Overlays.deleteOverlay(x); }); overlays = []; buttons = []; rects = []; overlayDone = null; panelDone = null;
        if (desktopConnected) { Controller.mousePressEvent.disconnect(desktopClick); desktopConnected = false; }
        if (tablet && view && tablet.gotoHomeScreen) tablet.gotoHomeScreen();
        view = ''; panelVersion++;
    }
    function desktopClick(e) {
        if (!overlayDone || !e || e.isPrimaryButton === false) return;
        for (var i = rects.length-1; i >= 0; i--) {
            var r = rects[i], b = buttons[i];
            if (b && e.x >= r.x && e.x <= r.x+r.width && e.y >= r.y && e.y <= r.y+r.height) {
                var done = overlayDone; clearPanel(); log('button ' + b.value); done(b.action || 'select', b.value); return;
            }
        }
    }
    function webEvent(raw) {
        var m; try { m = JSON.parse(raw); } catch(e) { return; }
        if (!panelDone || m.token !== panelVersion) return;
        var done = panelDone; clearPanel(); log('button ' + m.value); done(m.action, m.value);
    }
    // Reuse V2's clickable panel: Tablet buttons when supported, desktop hit regions otherwise.
    function panel(title, message, choices, done, key) {
        clearPanel(); view = key || title;
        try {
            if (typeof Tablet !== 'undefined' && Tablet.getTablet) {
                tablet = tablet || Tablet.getTablet('com.highfidelity.interface.tablet.system');
                if (tablet && tablet.webEventReceived && tablet.webEventReceived.connect && tablet.gotoWebScreen) {
                    if (!tabletConnected) { tablet.webEventReceived.connect(webEvent); tabletConnected = true; }
                    panelDone = done;
                    tablet.gotoWebScreen(meta.menu + '#' + encodeURIComponent(JSON.stringify({title:title,message:message,buttons:choices,token:panelVersion})));
                    log('panel ' + title + ' menu=' + meta.menu); return;
                }
            }
        } catch(e) { log('tablet unavailable ' + e); }
        if (typeof Overlays === 'undefined' || !Overlays.addOverlay) { log('clickable panel unavailable'); return; }
        var vp = Controller.getViewportDimensions(), x = 24, y = 80;
        function add(text, height, binding) {
            var p = {x:x,y:y,width:Math.max(250,vp.x-48),height:height,text:text,color:{red:255,green:255,blue:255},
                backgroundColor:binding ? {red:35,green:150,blue:190} : {red:30,green:38,blue:48},backgroundAlpha:.97,font:{size:binding ? 22 : 17},visible:true};
            overlays.push(Overlays.addOverlay('text',p)); buttons.push(binding); rects.push(p); y += height+10;
        }
        add(title,40,null); if (message) add(message,42,null);
        choices.forEach(function(b) { add(b.label,46,b); });
        overlayDone = done; Controller.mousePressEvent.connect(desktopClick); desktopConnected = true;
        log('panel ' + title + ' message=' + message);
    }
    function sessions() { return meta && meta.state && meta.state.sessions || []; }
    function mine() { return sessions().filter(function(s) { return s.participants.some(function(p) { return p.id === me(); }); })[0]; }
    function owned() { return sessions().filter(function(s) { return s.owner === me(); })[0]; }
    function myPart(s) { return s.participants.filter(function(p) { return p.id === me(); })[0]; }
    function command(type, s, p, extra) {
        var m = {sessionId:s.id,claim:p && p.claim}; Object.keys(extra || {}).forEach(function(k) { m[k] = extra[k]; }); send(type,m);
    }
    function stopLocal() {
        if (player) { player.stop(); player = null; log('restored session=' + (session && session.id)); }
        resource = null; data = null; clip = null; url = null; session = null; participant = null; prepared = ''; ready = false;
    }
    function refresh() {
        var next; try { next = JSON.parse(Entities.getEntityProperties(id,['userData']).userData).danceBallV3; }
        catch(e) { if (refreshError !== String(e)) { refreshError = String(e); log('metadata read failed ' + e); } return false; }
        if (!next || !next.epoch) return false;
        if (next.heartbeat !== lastHeartbeat) { lastHeartbeat = next.heartbeat; lastChange = Date.now(); }
        if (epoch && epoch !== next.epoch) { stopLocal(); clearPanel(); menuClaim = ''; pendingMenu = ''; snapshot = null; lastSequence = 0; }
        meta = next; epoch = next.epoch;
        meta.state = snapshot && snapshot.epoch === epoch ? snapshot.state : {sessions:[]};
        if (Date.now()-lastChange > 8000 || snapshot && Date.now()-lastStateAt > 8000) {
            if (session) log('coordinator heartbeat lost session=' + session.id);
            stopLocal(); clearPanel(); snapshot = null; lastSequence = 0; return false;
        }
        return true;
    }
    function receiveState(ch,raw,sender) {
        if (closed || ch !== channel) return;
        var m; try { m = JSON.parse(raw); } catch(e) { return; }
        if (m.type !== 'state' || !refresh() || m.epoch !== epoch || String(sender) !== meta.coordinator ||
            !m.state || !Array.isArray(m.state.sessions) || typeof m.seq !== 'number' || m.seq <= lastSequence) return;
        snapshot = m; lastSequence = m.seq; lastStateAt = Date.now(); meta.state = m.state;
    }
    function anchor() {
        var facing = Quat.fromPitchYawRollDegrees(0,Quat.safeEulerAngles(MyAvatar.orientation).y,0);
        var hips = MyAvatar.getAbsoluteDefaultJointTranslationInObjectFrame(MyAvatar.getJointIndex('Hips'));
        var floor = Vec3.sum(MyAvatar.position,Vec3.multiply(1.2,Quat.getForward(facing)));
        floor.y = MyAvatar.position.y + (hips.y-(meta.targetPelvisHeight || 1.2090423107147217))*MyAvatar.scale;
        var hit = Entities.findRayIntersection({origin:Vec3.sum(floor,{x:0,y:1,z:0}),direction:{x:0,y:-1,z:0}},true);
        if (hit.intersects && hit.distance < 5) floor.y = hit.intersection.y;
        // Placement uses the default scale-one hips, just as the shared playback transform does.
        return {position:{x:floor.x,y:floor.y,z:floor.z},hips:{x:hips.x,y:hips.y,z:hips.z},facing:facing};
    }
    function launcher() {
        panel('Dance Ball V3','Choose a category.',[{label:'Single',value:'single'},{label:'Couple',value:'couple'}],function(action,value) {
            if (action !== 'select' || ['single','couple'].indexOf(value) < 0 || !refresh()) return;
            if (mine() || owned()) { notice('Your session is already open. Click the main Dance Ball to stop.'); return; }
            if (value === 'couple') {
                panel('Couple','Cyan = Lead, pink = Follow. Choose sizing for this pair.',[
                    {label:'Match dance height',value:'match'},
                    {label:'Keep current sizes',value:'keep'},
                    {label:'Back',value:'back',action:'back',back:true}
                ],function(action,choice) {
                    if (action === 'back') { launcher(); return; }
                    if (action !== 'select' || ['match','keep'].indexOf(choice) < 0 || !refresh() || mine() || owned()) return;
                    send('spawn',{mode:'couple',matchHeight:choice === 'match',anchor:anchor(),requestId:nonce()});
                },'couple-sizing');
            } else send('spawn',{mode:'single',anchor:anchor(),requestId:nonce()});
        },'launcher');
    }
    function notice(message) { panel('Dance Ball V3',message,[{label:'Back',value:'back'}],function() { launcher(); },'notice'); }
    function cancel(s,p) { command(p ? 'stop' : 'cancel',s,p); clearPanel(); }
    function showDances(s,p,page) {
        var token = s.id + ':' + p.claim, expectedEpoch = epoch;
        pendingMenu = token;
        Script.require(Script.resolvePath('catalogue-store.js')).load(meta.catalogue,function(e,c) {
            if (closed || epoch !== expectedEpoch || pendingMenu !== token || !refresh()) return;
            var current = mine(); if (!current || current.id !== s.id || current.dance) return;
            var list = e ? [] : (c.dances || []).filter(function(d) { return d.parts.length === (s.mode === 'single' ? 1 : 2); });
            var vp = Controller.getViewportDimensions(), pageSize = Math.max(1,Math.min(6,Math.floor((vp.y-270)/56)-2));
            page = page || 0; var rows = list.slice(page*pageSize,(page+1)*pageSize).map(function(d) { return {label:d.name,value:d.id}; });
            if (page) rows.push({label:'Previous',value:'previous',action:'page'});
            if ((page+1)*pageSize < list.length) rows.push({label:'Next',value:'next',action:'page'});
            rows.push({label:'Back',value:'back',action:'back',back:true});
            panel(s.mode === 'single' ? 'Single' : 'Couple',e ? 'Dance catalogue could not load. Back to cancel.' : list.length ? 'Choose a dance.' : 'No ' + (s.mode === 'single' ? 'single' : 'couple') + ' dances available yet',rows,function(action,value) {
                if (!refresh()) return;
                var active = mine(); if (!active || active.id !== s.id || myPart(active).claim !== p.claim) return;
                if (action === 'page') { showDances(active,p,page+(value === 'next' ? 1 : -1)); return; }
                if (action === 'back') { cancel(active,p); launcher(); return; }
                if (!list.some(function(d) { return d.id === value; })) return;
                command('choose',active,p,{id:value});
            },'choose:' + s.id);
        });
    }
    function waiting(s,p) {
        var key = 'wait:' + s.id + ':' + s.status;
        if (view === key) return;
        panel(s.mode === 'single' ? 'Single' : 'Couple',s.status + ' — click the main Dance Ball to stop.',[],function() {},key);
    }
    function json(u, done) {
        Assets.getAsset({url:u,responseType:'text'},function(e,r) { if(e) { done(e); return; } var d; try { d = JSON.parse(r.response); } catch(x) { done(x); return; } done(null,d); });
    }
    function partFor(s,p) {
        var parts = s.dance.parts;
        if (p.role === 'solo') return parts[0];
        var lead = parts.filter(function(x) { return x.label === 'Lead' || x.role === 'leader'; })[0] || parts[0];
        return p.role === 'lead' ? lead : parts.filter(function(x) { return x !== lead; })[0];
    }
    function clipFor(d,part) { return typeof part.dancerIndex === 'number' ? d.dancers[part.dancerIndex] : d.dancers.filter(function(x) { return x.role === part.role; })[0]; }
    function clipURL(s,part,d) { return part.url || s.dance.manifest.slice(0,s.dance.manifest.lastIndexOf('/')+1)+encodeURIComponent(d.file); }
    function scaleFor(s) {
        if (s.mode !== 'couple') return 1;
        var scale = MyAvatar.scale;
        if (!s.matchHeight) return scale;
        var height = typeof MyAvatar.getHeight === 'function' ? MyAvatar.getHeight() : 0;
        var reference = s.dance.referenceHeight;
        if (!(height > 0) || !isFinite(height) || !(reference > 0) || !isFinite(reference) || !(scale > 0))
            throw Error('Avatar height could not be measured. Use Keep current sizes in the main Dance Ball menu.');
        return scale*reference/height;
    }
    function fail(s,p,error) { log('failed session=' + s.id + ' ' + error); command('stop',s,p); stopLocal(); clearPanel(); }
    function tick() {
        if (closed) return;
        try {
            if (!refresh()) return;
            if (!snapshot) {
                if (Date.now()-lastRequest > 1000) { lastRequest = Date.now(); send('getState'); }
                return;
            }
            var owner = owned(); if (owner) send('ownerPulse',{sessionId:owner.id});
            var next = mine();
            if (!next) {
                if (session || menuClaim) { stopLocal(); clearPanel(); menuClaim = ''; pendingMenu = ''; }
                return;
            }
            var p = myPart(next); command('pulse',next,p);
            if (session && session.id !== next.id) stopLocal();
            session = next; participant = p;
            if (!next.dance) {
                if ((p.role === 'lead' || p.role === 'solo') && menuClaim !== p.claim) { menuClaim = p.claim; showDances(next,p,0); }
                else if (p.role === 'follow') waiting(next,p);
                return;
            }
            pendingMenu = '';
            if (!next.start) waiting(next,p); else if (view.indexOf('wait:') === 0 || view.indexOf('choose:') === 0) clearPanel();
            var key = epoch + ':' + next.id + ':' + next.dance.revision + ':' + p.claim;
            if (prepared !== key) {
                stopLocal(); session = next; participant = p; prepared = key; loadedAt = Date.now();
                danceScale = scaleFor(next);
                var part = partFor(next,p);
                json(next.dance.manifest,function(e,d) {
                    // A callback for a stopped/replaced session must never stop or alter its successor.
                    if (closed || prepared !== key || !refresh() || !mine() || mine().id !== next.id) return;
                    if (e) { fail(next,p,e); return; }
                    data = d; clip = clipFor(d,part);
                    if (!clip || !clip.rootPositions || !clip.rootPositions.length) { fail(next,p,'Missing clip'); return; }
                    url = clipURL(next,part,clip); resource = AnimationCache.prefetch(url);
                });
            }
            ready = !!(resource && resource.state === 3);
            if (resource && resource.state === 4 || !ready && Date.now()-loadedAt > 30000) { fail(next,p,'Clip load failed or timed out'); return; }
            if (ready) command('ready',next,p,{revision:next.dance.revision});
            if (ready && next.start && Date.now() >= next.start && !player) {
                var leadPart = next.dance.parts.filter(function(x) { return x.role === next.anchor.role; })[0];
                // Anchor the Lead avatar origin at the floor point; preserve every authored relative offset.
                var a = JSON.parse(JSON.stringify(next.anchor));
                player = makePlayer(data,clip,url,meta.floor,meta.facing,next.start,{loop:true,periodSeconds:next.dance.periodSeconds,
                    anchor:a,anchorRoot:clipFor(data,leadPart).rootPositions[0],
                    sessionId:next.id,targetScale:danceScale});
                log('start session=' + next.id + ' role=' + p.role + ' utc=' + next.start + ' phaseMs=' + (Date.now()-next.start) + ' playback=native floorY=' + next.anchor.position.y + ' referenceRootY=' + clipFor(data,leadPart).rootPositions[0][1] + ' hipsY=' + MyAvatar.getAbsoluteDefaultJointTranslationInObjectFrame(MyAvatar.getJointIndex('Hips')).y);
            }
        } catch(e) { if (session && participant) fail(session,participant,e); else log('tick failed ' + e); }
    }
    function click(entity,event) {
        entity = String(entity); if (closed || event && event.isPrimaryButton === false || !refresh()) return;
        if (clickTimes[entity] && Date.now()-clickTimes[entity] < 900) return;
        clickTimes[entity] = Date.now();
        if (entity === String(id) || entity === String(meta.label)) {
            log('launcher click');
            var active = mine(), pending = owned();
            if (active) { command('stop',active,myPart(active)); clearPanel(); return; }
            if (pending) { send('cancel',{sessionId:pending.id}); clearPanel(); return; }
            launcher(); return;
        }
        var selected, role;
        sessions().some(function(s) { return ['solo','lead','follow'].some(function(r) {
            if (s.balls && s.balls[r] === entity) { selected = s; role = r; return true; } return false;
        }); });
        if (!selected) return;
        log('pose click session=' + selected.id + ' role=' + role);
        var p = myPart(selected), holder = selected.participants.filter(function(x) { return x.role === role; })[0];
        if (p && p.role === role) {
            return; // A replicated/stale pose-ball click never toggles Stop.
        }
        if (holder || mine() || owned() && owned().id !== selected.id || role !== 'follow' && selected.owner !== me() || role === 'follow' && selected.owner === me()) {
            notice('This role is occupied or reserved. Use your own pose balls.'); return;
        }
        command('claim',selected,null,{role:role,requestId:nonce()});
        // The acknowledged claim, replicated by the coordinator, opens the dance list.
    }
    function update() {
        if (!player) return;
        try { player.tick(); } catch(e) { fail(session,participant,e); }
    }
    function leave() {
        var s = session || mine(); if (s) command('leave',s,myPart(s));
        var owner = owned(); if (owner && !s) send('cancel',{sessionId:owner.id});
        stopLocal(); clearPanel(); menuClaim = ''; pendingMenu = '';
    }
    this.preload = function(entityID) {
        id = entityID; channel = 'darkride.dance.v3.' + id;
        log('preload launcher=' + id + ' script=' + Script.resolvePath('ball-client.js') + ' channel=' + channel);
        Entities.clickDownOnEntity.connect(click); Script.update.connect(update);
        Messages.subscribe(channel); Messages.messageReceived.connect(receiveState);
        if (Window.domainChanged) Window.domainChanged.connect(leave);
        timer = Script.setInterval(tick,500); tick();
    };
    this.clickDownOnEntity = click;
    this.unload = function() {
        leave(); closed = true; Script.clearInterval(timer); Entities.clickDownOnEntity.disconnect(click); Script.update.disconnect(update);
        if (Window.domainChanged) Window.domainChanged.disconnect(leave);
        if (tabletConnected) tablet.webEventReceived.disconnect(webEvent);
        Messages.messageReceived.disconnect(receiveState); Messages.unsubscribe(channel);
    };
});
