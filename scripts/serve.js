import http from 'node:http';
import {readFile} from 'node:fs/promises';
const allowed={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js','/data.js':'data.js','/favicon.svg':'favicon.svg'};
for(const file of ['backend.js','config.js','vendor/supabase.js'])allowed[`/${file}`]=file;
for(const file of ['leaflet.js','leaflet.css','images/marker-icon.png','images/marker-icon-2x.png','images/marker-shadow.png','images/layers.png','images/layers-2x.png'])allowed[`/vendor/leaflet/${file}`]=`vendor/leaflet/${file}`;
const types={html:'text/html',css:'text/css',js:'text/javascript',svg:'image/svg+xml',png:'image/png'};
const port=Number(process.env.PORT||4175);
http.createServer(async(req,res)=>{const file=allowed[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);res.end('Not found');return;}try{const body=await readFile(new URL(`../${file}`,import.meta.url));res.writeHead(200,{'Content-Type':`${types[file.split('.').pop()]}; charset=utf-8`,'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end('Unable to read asset');}}).listen(port,'127.0.0.1',()=>console.log(`CivicSignal: http://127.0.0.1:${port}`));
