import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanupHandler} from '../supabase/functions/cleanup-media/handler.js';
const request=()=>new Request('https://example.test/cleanup',{method:'POST',headers:{authorization:'Bearer test-service-key'}});
test('cleanup rejects requests without the server credential',async()=>{
 const handler=cleanupHandler({url:'https://example.test',serviceKey:'test-service-key',createClient:()=>{throw Error('must not access storage');}});
 assert.equal((await handler(new Request('https://example.test',{method:'POST'}))).status,401);
});
test('failed physical cleanup does not acknowledge or lose queued objects',async()=>{
 const calls=[];
 const api={rpc:async name=>{calls.push(name);return {data:['a.jpg'],error:null};},storage:{from:()=>({remove:async()=>({error:{message:'outage'}})})}};
 const handler=cleanupHandler({url:'https://example.test',serviceKey:'test-service-key',createClient:()=>api});
 assert.equal((await handler(request())).status,502);assert.deepEqual(calls,['pending_media_cleanup']);
});
test('successful cleanup acknowledges exactly the removed object paths',async()=>{
 const calls=[];const paths=['a.jpg','b.webm'];
 const api={rpc:async(name,args)=>{calls.push([name,args]);return name==='pending_media_cleanup'?{data:paths,error:null}:{error:null};},storage:{from:()=>({remove:async selected=>{assert.deepEqual(selected,paths);return {error:null};}})}};
 const handler=cleanupHandler({url:'https://example.test',serviceKey:'test-service-key',createClient:()=>api});
 assert.deepEqual(await (await handler(request())).json(),{removed:2});assert.deepEqual(calls[1],['ack_media_cleanup',{p_paths:paths}]);
});
