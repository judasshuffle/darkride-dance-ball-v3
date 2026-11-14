module.exports = {
    load:function(url,done) {
        if(url.indexOf('atp:')===0) {
            Assets.getMapping(url.slice(4),function(error,hash) {
                if(error) { done(Error(String(error))); return; }
                Assets.getAsset({url:'atp:'+hash,responseType:'text'},function(error,result) {
                    if(error) { done(Error(String(error))); return; }
                    var c;try { c=JSON.parse(result.response); } catch(e) { done(e);return; }
                    done(null,c);
                });
            }); return;
        }
        var r=new XMLHttpRequest();r.open('GET',url+(url.indexOf('?')<0?'?':'&')+'refresh='+Date.now());r.timeout=15000;
        r.onreadystatechange=function(){if(r.readyState!==4)return;try{if(r.status!==200)throw Error('Catalogue HTTP '+r.status);done(null,JSON.parse(r.responseText));}catch(e){done(e);}};r.send();
    },
    merge:function(catalogue,entry) {
        if(!catalogue || !Array.isArray(catalogue.dances)) { throw Error('Invalid catalogue; refusing to overwrite'); }
        var c=JSON.parse(JSON.stringify(catalogue));
        c.dances=c.dances.filter(function(d){return d.id!==entry.id;});c.dances.push(entry);
        c.dances.sort(function(a,b){return a.name.localeCompare(b.name);});c.schema=1;return c;
    }
};
