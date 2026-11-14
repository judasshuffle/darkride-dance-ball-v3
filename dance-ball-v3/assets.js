// Binary-safe, verified uploads using DarkRide's supported asset API.
module.exports = {
    read:function(url,binary,done) {
        // Wasm XMLHttpRequest owns a native response object. Explicitly dispose
        // each supported Http request so a library upload cannot retain all FBXs.
        var native = typeof Http !== 'undefined' && Http.createRequest && Http.dispose;
        var r = native ? Http.createRequest() : new XMLHttpRequest(), finished = false;
        r.open('GET',url); r.timeout = 30000;
        if (binary) { r.responseType = 'arraybuffer'; }
        function changed() {
            if (finished || r.readyState !== 4) return;
            finished = true;
            var error = (r.errorCode && r.errorCode !== 0) || (r.status !== 200 && r.status !== 0) ? Error('Read '+url+': HTTP '+r.status+', network error '+r.errorCode) : null;
            var bytes = error ? null : binary ? r.response : r.responseText;
            if (native) { r.readyStateChanged.disconnect(changed); Http.dispose(r); }
            else r.onreadystatechange = null;
            r = null;
            done(error,bytes);
        }
        if (native) r.readyStateChanged.connect(changed); else r.onreadystatechange = changed;
        r.send();
    },
    unpack:function(file,done) {
        if(typeof file.text==='string') { done(null,file.text); return; }
        if (file.module) {
            // The viewer's Http GET cannot read file:// URLs (network error
            // 301). Use the supported local JSON module loader instead. Its
            // public CommonJS cache must not retain the whole dance library.
            var key = Script.require.resolve(file.module), packet;
            try { packet = Script.require(key); }
            catch(e) { done(e); return; }
            finally {
                var cached = Script.require.cache[key];
                if (cached) {
                    if (cached.parent && cached.parent.children) {
                        cached.parent.children = cached.parent.children.filter(function(child) { return child !== cached; });
                    }
                    cached.exports = null;
                    delete Script.require.cache[key];
                }
            }
            if (!packet || packet.sha256 !== file.sha256 || typeof packet.gzipBase64 !== 'string') {
                done(Error('Invalid payload module: ' + file.module)); return;
            }
            this.unpack(packet,done); return;
        }
        if(file.gzipBase64) {
            try {
                var alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',s=file.gzipBase64;
                var out=new Uint8Array(Math.floor(s.length*3/4)),n=0,bits=0,value=0;
                for(var i=0;i<s.length;i++) {
                    if(s[i]==='=') { break; }
                    var v=alphabet.indexOf(s[i]);if(v<0) { throw Error('Invalid package base64'); }
                    value=(value<<6)|v;bits+=6;
                    if(bits>=8) { bits-=8;out[n++]=(value>>bits)&255; }
                }
                Assets.decompressData({data:out.buffer.slice(0,n),responseType:'arraybuffer'},function(error,result) {
                    if(error) { done(Error(String(error))); } else { done(null,result.data); }
                });
            } catch(e) { done(e); } return;
        }
        this.read(file.source,true,done);
    },
    put:function(path,bytes,done) {
        var expected = Assets.hashDataHex(bytes);
        Assets.putAsset({path:path,data:bytes},function(error) {
            if (error) { done(Error(String(error))); return; }
            function verify() {
            Assets.getMapping(path,function(error,hash) {
                if (error || hash !== expected) { done(Error('Mapping verification failed: '+path)); return; }
                Assets.getAsset({url:'atp:'+path,responseType:'arraybuffer'},function(error,download) {
                    if (error || Assets.hashDataHex(download.response) !== expected) { done(Error('Download verification failed: '+path)); return; }
                    done(null,'atp:'+path);
                });
            });
            }
            verify();
        });
    }
};
