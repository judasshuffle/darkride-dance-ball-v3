// Reuses V2's byte verification and catalogue-last publication for a V3 release.
module.exports = function(job,done) {
    var assets = Script.require(Script.resolvePath('assets.js'));
    var store = Script.require(Script.resolvePath('catalogue-store.js'));
    var files = job.files.slice(), total = files.length;
    function cancelled() { return job.cancelled && job.cancelled(); }
    function next() {
        if (cancelled()) return;
        if (!files.length) { commit(); return; }
        var f = files.shift();
        if (job.progress) job.progress(total-files.length,total,f.path);
        assets.unpack(f,function(e,bytes) {
            if (cancelled()) return;
            if (e) { done(e); return; }
            try {
                if (Assets.hashDataHex(bytes) !== f.sha256) { done(Error('Local package changed: ' + f.path)); return; }
                assets.put(f.path,bytes,function(e) {
                    if (cancelled()) return;
                    if(e) done(e);
                    // Let the current read/upload/readback callbacks unwind,
                    // releasing their buffers before reading the next file.
                    else Script.setTimeout(next,0);
                });
            } catch(e) { done(e); }
        });
    }
    function commit() {
        if (cancelled()) return;
        store.load(job.catalogue,function(e,c) {
            if (cancelled()) return;
            if (e && String(e).indexOf('Asset not found') < 0) { done(e); return; }
            try { c = e ? {schema:1,dances:[]} : c; job.entries.forEach(function(d) { c = store.merge(c,d); }); }
            catch(x) { done(x); return; }
            assets.put(job.catalogue.slice(4),JSON.stringify(c),done);
        });
    }
    next();
};
