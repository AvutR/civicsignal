import {mkdir,copyFile,rm,cp,writeFile} from 'node:fs/promises';
import {config} from '../config.js';
import './bundle-client.js';
const output=new URL('../dist/',import.meta.url);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const name of ['index.html','styles.css','app.js','data.js','backend.js','favicon.svg','.nojekyll'])await copyFile(new URL(`../${name}`,import.meta.url),new URL(name,output));
const browserConfig={supabaseUrl:process.env.SUPABASE_URL||config.supabaseUrl,supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||config.supabasePublishableKey};
if(Boolean(browserConfig.supabaseUrl)!==Boolean(browserConfig.supabasePublishableKey))throw Error('Set both Supabase URL and publishable key, or leave both empty for local demo mode.');
if(browserConfig.supabaseUrl){
 const url=new URL(browserConfig.supabaseUrl);
 if(url.protocol!=='https:')throw Error('Use an HTTPS Supabase project URL.');
 const key=browserConfig.supabasePublishableKey;
 let valid=key.startsWith('sb_publishable_');
 if(key.startsWith('eyJ')){try{valid=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{valid=false;}}
 if(!valid)throw Error('Only a Supabase publishable or legacy anon key may be included in the browser. Never use a secret/service-role key.');
}
await writeFile(new URL('config.js',output),`export const config = ${JSON.stringify(browserConfig)};\n`);
await cp(new URL('../vendor/',import.meta.url),new URL('vendor/',output),{recursive:true});
console.log('Static site built in dist/');
