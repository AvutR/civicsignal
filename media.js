export const MAX_PHOTOS=3, MAX_AUDIO=1, MAX_AUDIO_SECONDS=60;
export const PHOTO_BYTES=2*1024*1024, AUDIO_BYTES=8*1024*1024;
export const audioTypes=['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'];
export function checkFile(file,kind){
  if(!file.size)throw Error('This file is empty.');
  const type=file.type.split(';')[0];
  if(kind==='image'&&!['image/jpeg','image/png','image/webp'].includes(type))throw Error('Use a JPG, PNG, or WebP photo.');
  if(kind==='audio'&&!audioTypes.includes(type))throw Error('Use MP3, M4A, WAV, Ogg, or WebM audio.');
  if(file.size>(kind==='image'?20*1024*1024:AUDIO_BYTES))throw Error(kind==='image'?'Choose a photo under 20 MB.':'Choose audio under 8 MB.');
}
export async function preparePhoto(file){
  checkFile(file,'image');
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));
    if(!blob||blob.size>PHOTO_BYTES)throw Error('This photo is too complex to compress. Choose a smaller photo.');
    return {id:crypto.randomUUID(),kind:'image',mime:'image/jpeg',size:blob.size,name:'Photo',blob};
  }finally{bitmap.close();}
}
export async function prepareAudio(file){
  checkFile(file,'audio');
  const url=URL.createObjectURL(file),audio=new Audio();audio.preload='metadata';
  try{
    const duration=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('Could not read this audio file. Try MP3, M4A, or WAV.')),8000);
      audio.onloadedmetadata=()=>{clearTimeout(timeout);Number.isFinite(audio.duration)?resolve(audio.duration):reject(Error('Could not determine the audio length. Try MP3, M4A, or WAV.'));};
      audio.onerror=()=>{clearTimeout(timeout);reject(Error('This browser cannot play that audio file.'));};audio.src=url;
    });
    if(duration<=0||duration>MAX_AUDIO_SECONDS+.5)throw Error('Keep your audio note to 60 seconds or less.');
    return {id:crypto.randomUUID(),kind:'audio',mime:file.type.split(';')[0],size:file.size,name:'Voice note',duration,blob:file};
  }finally{audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);}
}
let database;
async function db(){
  if(!database)database=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('civicsignal-media',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('attachments',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Media storage is unavailable in this browser.'));
  });return database;
}
export async function saveLocalMedia(reportId,items){
  if(!items.length)return;const database=await db();
  await new Promise((resolve,reject)=>{const tx=database.transaction('attachments','readwrite');for(const item of items)tx.objectStore('attachments').put({...item,reportId});tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Could not save attachments. Browser storage may be full.'));tx.onabort=()=>reject(Error('Attachment save was interrupted.'));});
}
export async function loadLocalMedia(ids){
  if(!ids.length)return [];const database=await db();
  return Promise.all(ids.map(id=>new Promise((resolve,reject)=>{const request=database.transaction('attachments').objectStore('attachments').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Could not load saved media.'));})));
}
export async function deleteLocalMedia(ids){
  if(!ids.length)return;const database=await db();
  await new Promise((resolve,reject)=>{const tx=database.transaction('attachments','readwrite');ids.forEach(id=>tx.objectStore('attachments').delete(id));tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Could not clear saved media.'));});
}
export function metadata(item){const {blob,...rest}=item;return rest;}

export function createComposer({onError,onChange}){
  let items=[],recorder,stream,timer,started=0,working=false;
  const list=document.querySelector('#attachment-previews'),message=document.querySelector('#recording-status');
  const record=document.querySelector('#record-audio'),stop=document.querySelector('#stop-recording');
  const urls=[];
  const release=()=>{urls.splice(0).forEach(url=>URL.revokeObjectURL(url));};
  function render(){
    release();list.replaceChildren();
    for(const item of items){
      const card=document.createElement('div');card.className='attachment-preview';
      const url=URL.createObjectURL(item.blob);urls.push(url);
      const preview=document.createElement(item.kind==='image'?'img':'audio');preview.src=url;
      if(item.kind==='image')preview.alt='Selected issue photo';else{preview.controls=true;preview.preload='metadata';}
      const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent=`Remove ${item.kind==='image'?'photo':'audio'}`;remove.disabled=working;
      remove.onclick=()=>{items=items.filter(x=>x.id!==item.id);render();};
      card.append(preview,remove);list.append(card);
    }
    onChange?.(items);
  }
  async function add(files,kind){
    if(working)return;working=true;updateControls();
    try{for(const file of files){if(items.filter(x=>x.kind===kind).length>=(kind==='image'?MAX_PHOTOS:MAX_AUDIO))throw Error(kind==='image'?'You can add up to 3 photos.':'Remove the existing audio note before adding another.');items.push(await (kind==='image'?preparePhoto(file):prepareAudio(file)));render();}}
    catch(error){onError(error.message);}finally{working=false;updateControls();render();}
  }
  function updateControls(){
    document.querySelector('#photo-files').disabled=working;document.querySelector('#audio-file').disabled=working;
    document.querySelector('#camera-photo').disabled=working;
    record.disabled=working||items.some(x=>x.kind==='audio');
    document.querySelector('#issue-form button[type=submit]').disabled=working;
  }
  document.querySelector('#photo-files').addEventListener('change',async event=>{await add([...event.target.files],'image');event.target.value='';});
  document.querySelector('#camera-photo').addEventListener('change',async event=>{await add([...event.target.files],'image');event.target.value='';});
  document.querySelector('#audio-file').addEventListener('change',async event=>{await add([...event.target.files],'audio');event.target.value='';});
  function stopTracks(){stream?.getTracks().forEach(track=>track.stop());stream=null;clearInterval(timer);stop.hidden=true;record.hidden=false;}
  record.addEventListener('click',async()=>{
    if(working)return;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){onError('Microphone recording is not available here. You can upload an audio file instead.');return;}
    working=true;updateControls();
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
      recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);const chunks=[];started=Date.now();
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onerror=()=>{onError('Recording failed. Try uploading an audio file.');stopTracks();working=false;updateControls();};
      recorder.onstop=()=>{
        const duration=Math.min(60,(Date.now()-started)/1000),mime=recorder.mimeType.split(';')[0];stopTracks();
        const blob=new Blob(chunks,{type:mime});
        if(blob.size&&blob.size<=AUDIO_BYTES&&audioTypes.includes(mime)){items.push({id:crypto.randomUUID(),kind:'audio',name:'Voice note',mime,size:blob.size,duration,blob});message.textContent=`Recorded ${Math.ceil(duration)} seconds. Listen before posting.`;render();}
        else onError('The recording could not be saved. Try again or upload an audio file.');
        working=false;updateControls();render();
      };
      recorder.start();record.hidden=true;stop.hidden=false;message.textContent='Recording… 0 / 60 seconds';
      timer=setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);message.textContent=`Recording… ${seconds} / 60 seconds`;if(seconds>=60&&recorder.state==='recording')recorder.stop();},250);
    }catch{stopTracks();working=false;updateControls();message.textContent='';onError('Microphone access was unavailable. Allow access or upload an audio file.');}
  });
  stop.addEventListener('click',()=>{if(recorder?.state==='recording')recorder.stop();});
  window.addEventListener('pagehide',()=>{if(recorder?.state==='recording')recorder.stop();stopTracks();release();});
  return {get items(){return items;},get busy(){return working;},clear(){items=[];message.textContent='';render();updateControls();},lock(value){working=value;updateControls();render();}};
}
