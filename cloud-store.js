/* One online attempt per action. Failed requests are never queued for reconnect. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OnlineCloudStore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  class OnlineCloudStore {
    constructor(url,request=fetch){this.url=url;this.request=request;}
    async transaction(update,unused,local,deadline=null){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),15000);
      try{
        const read=await this.request(this.url,{headers:{'X-Firebase-ETag':'true'},cache:'no-store',signal:controller.signal});
        if(!read.ok)throw Error('Cloud read '+read.status);
        const current=await read.json(),etag=read.headers.get('etag');
        const next=update(current);
        if(next===undefined)return {committed:false,snapshot:{val:()=>current}};
        if(!etag)throw Error('Missing concurrency token');
        if(deadline && Date.now()>=deadline)throw Error('Snapshot day ended');
        const write=await this.request(this.url,{method:'PUT',headers:{'Content-Type':'application/json','if-match':etag},body:JSON.stringify(next),signal:controller.signal});
        if(write.status===412){const newer=await write.json();return {committed:false,snapshot:{val:()=>newer}};}
        if(!write.ok)throw Error('Cloud write '+write.status);
        const saved=await write.json();
        return {committed:true,snapshot:{val:()=>saved}};
      }finally{clearTimeout(timer);}
    }
  }
  OnlineCloudStore.authenticatedRequest=function(getToken,request=fetch){
    return async function(url,options={}){
      const token=await getToken();
      if(!token)throw Error('Authentication required');
      return request(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token}`}});
    };
  };
  return OnlineCloudStore;
});
