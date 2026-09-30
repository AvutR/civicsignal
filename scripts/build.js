import {mkdir,copyFile,rm,cp} from 'node:fs/promises';
const output=new URL('../dist/',import.meta.url);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const name of ['index.html','styles.css','app.js','data.js','favicon.svg','.nojekyll'])await copyFile(new URL(`../${name}`,import.meta.url),new URL(name,output));
await cp(new URL('../vendor/',import.meta.url),new URL('vendor/',output),{recursive:true});
console.log('Static site built in dist/');
