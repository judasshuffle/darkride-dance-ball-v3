// V3: independent sessions, direct pose-ball claims, and one authoritative start.
// No identity is derived from display names. Every mutation names an exact session.
module.exports = function(delay, timeout, loadTimeout, abandonTimeout) {
    var next = 1, sessions = [], requests = {};
    abandonTimeout = abandonTimeout || 120000;
    function copy(v) { return JSON.parse(JSON.stringify(v)); }
    function find(id) { return sessions.filter(function(s) { return s.id === id; })[0]; }
    function occupied(id) { return sessions.some(function(s) { return s.participants.some(function(p) { return p.id === id; }); }); }
    function reservedElsewhere(id, s) { return sessions.some(function(x) { return x !== s && x.owner === id; }); }
    function remove(s) { sessions = sessions.filter(function(x) { return x !== s; }); }
    function validAnchor(a) {
        function vector(v, keys) { return v && keys.every(function(k) { return typeof v[k] === 'number' && isFinite(v[k]); }); }
        if (!a || !vector(a.position, ['x','y','z']) || !vector(a.hips, ['x','y','z']) || !vector(a.facing, ['x','y','z','w'])) return false;
        var q = a.facing;
        return Math.abs(q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w-1) < .001 && Math.abs(q.x) < .001 && Math.abs(q.z) < .001;
    }
    function status(s) {
        if (s.start) return 'Dancing — click the main Dance Ball to stop';
        if (!s.dance) return s.mode === 'single' ? 'Choose a solo dance' : 'Waiting for lead to choose a dance';
        if (s.mode === 'couple' && s.participants.length !== 2) return 'Waiting for partner';
        return 'Loading dance';
    }
    return {
        state: function() { return {sessions: copy(sessions).map(function(s) { s.status = status(s); return s; })}; },
        receive: function(id, m, now) {
            if (!id || id === 'null' || /00000000-0000-0000-0000-000000000000/.test(id)) return;
            var s, p;
            if (m.type === 'spawn') {
                if (typeof m.sentAt !== 'number' || now-m.sentAt > 10000 || m.sentAt-now > 5000 ||
                    !m.requestId || requests[id + ':' + m.requestId] || occupied(id) || reservedElsewhere(id, null) ||
                    ['single','couple'].indexOf(m.mode) < 0 || !validAnchor(m.anchor)) return;
                requests[id + ':' + m.requestId] = now;
                s = {id:'v3-session-' + next++, owner:id, ownerSeen:now, mode:m.mode, anchor:copy(m.anchor),
                    created:now, selected:0, dance:null, start:0, loop:true, matchHeight:m.mode === 'couple' && m.matchHeight === true, participants:[]};
                sessions.push(s); return;
            }
            // Never fall back to the sender's current session: late Stop/Ready are inert.
            s = find(m.sessionId); if (!s) return;
            p = s.participants.filter(function(x) { return x.id === id; })[0];
            if (m.type === 'ownerPulse' && s.owner === id) { s.ownerSeen = now; return; }
            if (m.type === 'cancel' && s.owner === id && !s.start) { remove(s); return; }
            if (m.type === 'claim') {
                if (s.start || !m.requestId) return;
                if (p) return; // Duplicate claims never toggle Stop or add a second role.
                var roles = s.mode === 'single' ? ['solo'] : ['lead','follow'];
                if (roles.indexOf(m.role) < 0 || occupied(id) || reservedElsewhere(id, s) ||
                    ((m.role === 'lead' || m.role === 'solo') && id !== s.owner) ||
                    (m.role === 'follow' && id === s.owner) ||
                    s.participants.some(function(x) { return x.role === m.role; })) return;
                s.participants.push({id:id, role:m.role, claim:m.requestId, ready:false, seen:now}); return;
            }
            if (!p || m.claim !== p.claim) return;
            if (m.type === 'stop' || m.type === 'leave') { remove(s); return; }
            if (m.type === 'choose') {
                var d = m.dance, count = s.mode === 'single' ? 1 : 2;
                if (s.dance || (p.role !== 'lead' && p.role !== 'solo') || !d || !d.revision || !d.manifest ||
                    !d.parts || d.parts.length !== count || !isFinite(d.periodSeconds) || d.periodSeconds <= 0 ||
                    (count === 2 && d.parts[0].role === d.parts[1].role)) return;
                s.dance = copy(d); s.selected = now;
                // Pin Lead as the placement reference even when Follow clicked first.
                var lead = d.parts.filter(function(x) { return x.label === 'Lead' || x.role === 'leader'; })[0] || d.parts[0];
                s.participants.forEach(function(x) { x.ready = false; });
                s.anchor.role = lead.role; return;
            }
            if (m.type === 'pulse' || m.type === 'ready') {
                p.seen = now;
                if (m.type === 'ready' && s.dance && m.revision === s.dance.revision) p.ready = true;
                if (!s.start && s.dance && s.participants.length === (s.mode === 'single' ? 1 : 2) &&
                    s.participants.every(function(x) { return x.ready; })) s.start = now + delay;
            }
        },
        tick: function(now) {
            Object.keys(requests).forEach(function(k) { if (now-requests[k] > abandonTimeout*2) delete requests[k]; });
            sessions.slice().forEach(function(s) {
                var ownerPresent = s.participants.some(function(p) { return p.id === s.owner; });
                if (s.participants.some(function(p) { return now-p.seen > timeout; }) ||
                    (!ownerPresent && now-s.ownerSeen > timeout) ||
                    (!s.start && now-s.created > abandonTimeout) ||
                    (!s.start && s.dance && now-s.selected > loadTimeout)) remove(s);
            });
        },
        remove: function(id) { sessions.slice().forEach(function(s) { if (!id || s.owner === id || s.participants.some(function(p) { return p.id === id; })) remove(s); }); }
    };
};
