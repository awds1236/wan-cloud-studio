import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';

async function setup(t, options={}) {
  const server=createApp(options);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test('unconfigured app serves UI but cannot submit a billed job',async t=>{
  const url=await setup(t);
  assert.match(await (await fetch(url)).text(),/Wan Cloud Studio/);
  assert.deepEqual(await (await fetch(url+'/api/config')).json(),{configured:false});
  assert.equal((await fetch(url+'/api/jobs',{method:'POST'})).status,503);
});
test('validate before billing, keep credentials server-side, track status and cancel',async t=>{
  const calls=[];
  const url=await setup(t,{key:'secret-test',endpoint:'test-endpoint',request:async(path,options)=>{
    calls.push({path,options});return {ok:true,json:async()=>path.endsWith('/run')?{id:'job-123',status:'IN_QUEUE'}:{status:path.includes('cancel')?'CANCELLED':'COMPLETED',output:{video_url:'https://example.com/video.mp4'}}};
  }});
  const post=body=>fetch(url+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post({prompt:'',preset:'draft',seed:42})).status,400);
  assert.equal(calls.length,0);
  assert.equal((await fetch(url+'/api/jobs',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal(calls.length,0);
  assert.equal((await post({prompt:'A forest',preset:'draft',seed:42})).status,200);
  assert.equal(calls[0].options.headers.Authorization,'Bearer secret-test');
  assert.equal(JSON.parse(calls[0].options.body).policy.executionTimeout,900000);
  assert.equal((await fetch(url+'/api/jobs/unknown')).status,404);
  assert.equal((await (await fetch(url+'/api/jobs/job-123')).json()).status,'COMPLETED');
  assert.equal((await (await fetch(url+'/api/jobs/job-123/cancel',{method:'POST'})).json()).status,'CANCELLED');
  assert.equal((await (await fetch(url+'/api/config')).text()).includes('secret-test'),false);
});
test('provider failure returns actionable error without provider secrets',async t=>{
  const url=await setup(t,{key:'secret-test',endpoint:'test',request:async()=>({ok:false,status:401})});
  const response=await fetch(url+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'A forest',preset:'draft',seed:42})});
  assert.equal(response.status,502);
  assert.match((await response.json()).error,/401/);
});
test('local mode accepts tiny job without cloud credentials or requests',async t=>{
  let submitted;
  const url=await setup(t,{request:()=>{throw Error('Cloud must not be called');},local:{ready:()=>true,submit:async input=>{submitted=input;return {id:'local-1',status:'IN_PROGRESS'};},status:()=>({id:'local-1',status:'COMPLETED',output:{video_url:'/outputs/local-1.mp4'}}),cancel:()=>({status:'CANCELLED'})}});
  assert.deepEqual(await (await fetch(url+'/api/config')).json(),{configured:true,mode:'local'});
  const response=await fetch(url+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'A forest',preset:'tiny',seed:42})});
  assert.equal(response.status,200);assert.equal(submitted.preset,'tiny');
  assert.equal((await (await fetch(url+'/api/jobs/local-1')).json()).status,'COMPLETED');
});
