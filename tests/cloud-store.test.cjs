const test=require('node:test'),assert=require('node:assert/strict');
const Store=require('../cloud-store.js');
const response=(value,status=200,etag='"one"')=>({ok:status===200,status,headers:{get:()=>etag},json:async()=>value});
test('conditional write uses server ETag and returns server-confirmed data',async()=>{
  const calls=[];const store=new Store('https://test.invalid/data.json',async(url,options)=>{calls.push(options);return calls.length===1?response({revision:1}):response({revision:2});});
  const result=await store.transaction(v=>({revision:v.revision+1}));assert.equal(result.committed,true);assert.equal(calls[1].headers['if-match'],'"one"');assert.equal(result.snapshot.val().revision,2);
});
test('concurrent change returns conflict and never retries stale write',async()=>{
  let count=0;const store=new Store('test',async()=>++count===1?response({revision:1}):response({revision:3},412));
  const result=await store.transaction(()=>({revision:2}));assert.equal(result.committed,false);assert.equal(count,2);assert.equal(result.snapshot.val().revision,3);
});
test('disconnect after read is not queued for reconnect',async()=>{
  let count=0;const store=new Store('test',async()=>{if(++count===1)return response({revision:1});throw Error('Disconnected');});
  await assert.rejects(store.transaction(()=>({revision:2})),/Disconnected/);assert.equal(count,2);
});
test('quarter-end deadline expires before write; no backdated request is sent',async()=>{
  let count=0;const store=new Store('test',async()=>{count++;return response({revision:1});});
  await assert.rejects(store.transaction(()=>({revision:2}),null,false,Date.now()-1),/day ended/);assert.equal(count,1);
});
test('authenticated requests send the Firebase ID token using the Realtime Database auth parameter',async()=>{
  let seen;
  const request=Store.authenticatedRequest(async()=>'id-token',async(url,options)=>{seen={url,options};return response({ok:true});});
  await request('https://test.invalid/user.json',{headers:{Accept:'application/json'}});
  assert.equal(seen.url,'https://test.invalid/user.json?auth=id-token');
  assert.equal(seen.options.headers.Accept,'application/json');
  await request('https://test.invalid/user.json?print=silent');
  assert.equal(seen.url,'https://test.invalid/user.json?print=silent&auth=id-token');
  await assert.rejects(Store.authenticatedRequest(async()=>null,async()=>response({}))('x'),/Authentication required/);
});
