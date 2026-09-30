// Used only by the server-side GitHub Actions maintenance job.
const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY}=process.env;
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)throw Error('Cleanup needs a project URL and a server-side service-role secret.');
const url=new URL('/functions/v1/cleanup-media',SUPABASE_URL);
if(url.protocol!=='https:')throw Error('Cleanup endpoint must use HTTPS.');
const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`Media cleanup failed (HTTP ${response.status}); queued files are retained for retry.`);
const result=await response.json();console.log(`Removed ${Number(result.removed)||0} queued media objects.`);
