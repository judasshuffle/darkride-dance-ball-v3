// V3 world-script playback: native avatar animation plus shared UTC placement.
// AnimationWrapper/getAnimation is private-script-only in the shipped viewer.
module.exports = function(data, d, url, floor, facing, start, options) {
    var original = {position:MyAvatar.position,orientation:MyAvatar.orientation,scale:MyAvatar.scale};
    var stopped = false, cycle = -1;
    options = options || {};
    if (options.anchor) {
        var anchor = options.anchor, root = options.anchorRoot;
        if (!root) throw Error('Missing first-frame placement reference');
        facing = Quat.multiply(anchor.facing,Quat.fromPitchYawRollDegrees(0,-180,0));
        // anchor.position is the raycast FLOOR, not an avatar origin. Centre the
        // Lead's initial horizontal root there, preserving authored hip heights
        // and every relative Lead/Follow offset with one rigid transform.
        floor = Vec3.subtract(anchor.position,Vec3.multiplyQbyV(facing,{x:root[0],y:0,z:root[2]}));
    }
    var hipsIndex = MyAvatar.getJointIndex('Hips');
    if (hipsIndex < 0) throw Error('Use an avatar with a Hips joint');
    var danceScale = typeof options.targetScale === 'number' ? options.targetScale : 1;
    if (!(danceScale > 0) || !isFinite(danceScale)) throw Error('Invalid dance scale');
    var orientation = Quat.multiply(facing,Quat.fromPitchYawRollDegrees(0,180,0));
    var hips = MyAvatar.getAbsoluteDefaultJointTranslationInObjectFrame(hipsIndex);
    var hipsOffset = Vec3.multiplyQbyV(orientation,{x:hips.x*danceScale,y:hips.y*danceScale,z:hips.z*danceScale});
    MyAvatar.orientation = orientation; MyAvatar.scale = danceScale; MyAvatar.collisionsEnabled = false;
    function sample(clip,t,period) {
        if (options.loop) t = t-Math.floor(t/period)*period;
        var frame = Math.min(clip.frames-1,Math.max(0,t*clip.fps)), a = Math.floor(frame), b = Math.min(a+1,clip.frames-1), w = frame-a;
        var p = clip.rootPositions[a], q = clip.rootPositions[b];
        return {frame:frame,path:Vec3.multiplyQbyV(facing,{x:p[0]+(q[0]-p[0])*w,y:p[1]+(q[1]-p[1])*w,z:p[2]+(q[2]-p[2])*w})};
    }
    function place(path) { return Vec3.subtract(Vec3.sum(floor,path),hipsOffset); }
    function stop() {
        if (stopped) return; stopped = true;
        // Attempt every restoration even if one API throws. World collisions
        // must be enabled, including when they were off before the dance.
        var error;
        function restore(fn) { try { fn(); } catch(e) { error = error || e; } }
        restore(function() { MyAvatar.restoreAnimation(); });
        restore(function() { MyAvatar.position = original.position; });
        restore(function() { MyAvatar.orientation = original.orientation; });
        restore(function() { MyAvatar.scale = original.scale; });
        MyAvatar.collisionsEnabled = true;
        if (error && typeof print === 'function') print('[DANCE BALL V3 v3-public-1 PLAYBACK] restore warning ' + error);
    }
    return {
        stop:stop,
        tick:function() {
            var t = (Date.now()-start)/1000; if (t < 0 || stopped) return false;
            var period = options.periodSeconds || d.durationSeconds;
            if (!options.loop && t >= period) return true;
            var currentCycle = options.loop ? Math.floor(t/period) : 0, s = sample(d,t,period);
            MyAvatar.position = place(s.path);
            // Both viewers start and restart at the original UTC phase. Use the
            // permitted native player; do not read restricted AnimationWrapper.
            if (currentCycle !== cycle) {
                MyAvatar.overrideAnimation(url,d.fps,false,s.frame,d.frames-1);
                cycle = currentCycle;
                if (typeof print === 'function') print('[DANCE BALL V3 v3-public-1 PLAYBACK] session=' + (options.sessionId || '') + ' cycle=' + cycle + ' frame=' + s.frame + ' utcStart=' + start);
            }
            return false;
        }
    };
};
