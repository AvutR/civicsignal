export function cleanupHandler({url,serviceKey,createClient}){
  return async request=>{
    if(!serviceKey||request.headers.get('authorization')!==`Bearer ${serviceKey}`)return new Response('Unauthorized',{status:401});
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    const api=createClient(url,serviceKey,{auth:{persistSession:false}});
    const {data:paths,error}=await api.rpc('pending_media_cleanup');
    if(error)return Response.json({error:'Could not read cleanup queue.'},{status:500});
    if(!paths?.length)return Response.json({removed:0});
    const removed=await api.storage.from('civic-media').remove(paths);
    if(removed.error)return Response.json({error:'Cleanup incomplete; queued files will be retried.'},{status:502});
    const ack=await api.rpc('ack_media_cleanup',{p_paths:paths});
    if(ack.error)return Response.json({error:'Cleanup will be retried.'},{status:500});
    return Response.json({removed:paths.length});
  };
}
