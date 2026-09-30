import {categories,cities,seedReports,validReport,filterReports,summarize} from './data.js';
import * as backend from './backend.js';
const $=selector=>document.querySelector(selector),storageKey='civicsignal.reports.v1';
let reports=seedReports(),storageAvailable=true;
if(backend.sharedMode){reports=[];}else{try{const saved=localStorage.getItem(storageKey);if(saved!==null){const parsed=JSON.parse(saved);if(!Array.isArray(parsed)||!parsed.every(validReport)||new Set(parsed.map(r=>r.id)).size!==parsed.length)throw Error('Invalid data');reports=parsed;}else{localStorage.setItem(storageKey,JSON.stringify(reports));}}catch{storageAvailable=false;}}
let currentAccount={user:null,reviewer:false},syncing=false,pendingReport=null,detailReport=null;
const filters={category:'all',days:'30',status:'all',search:''};
let map,layers,draftMarker,selectedPoint=null,selectedId=null;
let notificationTimer;
function notify(message){clearTimeout(notificationTimer);$('#toast').textContent=message;notificationTimer=setTimeout(()=>{$('#toast').textContent='';},9000);}
function persist(next){try{localStorage.setItem(storageKey,JSON.stringify(next));reports=next;storageAvailable=true;return true;}catch{notify('Could not save: browser storage is unavailable or full. Export your reports and enable storage before making changes.');return false;}}
function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function setPoint(lat,lng){selectedPoint={lat,lng};$('#pin-status').textContent=`Pin selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;if(map){draftMarker?.remove();draftMarker=L.marker([lat,lng]).addTo(map);}}
if(window.L){map=L.map('map',{scrollWheelZoom:false}).setView([22.5,79],4);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).on('tileerror',()=>{$('#map-note').textContent='Map tiles unavailable. Reports and location controls still work.';}).addTo(map);layers=L.layerGroup().addTo(map);map.on('click',event=>setPoint(event.latlng.lat,event.latlng.lng));}else{$('#map').append(element('p','Map could not load. Choose a city or enter coordinates to place a report.','map-fallback'));}
async function openReport(id){
 const r=reports.find(r=>r.id===id);if(!r)return;selectedId=id;detailReport={...r};
 $('#detail-title').textContent=r.title;$('#detail-meta').textContent=`${r.id} · ${r.place} · ${categories[r.category]} · ${r.priority==='high'?'High priority':'General'}`;
 $('#detail-description').textContent=r.description||'No additional details provided.';$('#detail-date').textContent=`Received ${new Date(r.createdAt).toLocaleString()} · ${r.demo?'Sample report':backend.sharedMode?'Shared community report':'Your local report'}`;
 $('#detail-status').value=r.status;$('#review-note').value='';$('#detail-error').textContent='';
 const canReview=!backend.sharedMode||currentAccount.reviewer;$('#detail-status').disabled=!canReview;$('#save-status').hidden=!canReview;$('#review-note-field').hidden=!backend.sharedMode||!canReview;
 $('#review-permission').textContent=canReview?(backend.sharedMode?'Your review note will be public.':'Status changes affect this browser only.'):'Only assigned reviewers can change status.';
 $('#delete-report').hidden=backend.sharedMode&&!r.canDelete;$('#report-history').replaceChildren();$('#detail-dialog').showModal();
 if(backend.sharedMode){try{const history=await backend.reportHistory(id);if(selectedId!==id)return;for(const event of history){const item=element('li');item.append(element('strong',event.status),element('p',event.note),element('small',new Date(event.createdAt).toLocaleString()));$('#report-history').append(item);}}catch(error){$('#detail-error').textContent=`History unavailable: ${error.message}`;}}
}
function render(){
 const stats=summarize(reports);$('#total-count').textContent=stats.total;$('#priority-count').textContent=stats.high;$('#resolved-count').textContent=stats.resolved;$('#community-count').textContent=stats.communities;
 document.querySelectorAll('[data-category]').forEach(chip=>{chip.classList.toggle('selected',chip.dataset.category===filters.category);chip.setAttribute('aria-pressed',String(chip.dataset.category===filters.category));chip.querySelector('b').textContent=reports.filter(r=>chip.dataset.category==='all'||r.category===chip.dataset.category).length;});
 const visible=filterReports(reports,filters).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));$('#visible-count').textContent=`${visible.length} of ${reports.length} reports`;$('#request-count').textContent=`${visible.length} matching reports`;
 const list=$('#request-list');list.replaceChildren();layers?.clearLayers();
 for(const r of visible){const row=element('button',undefined,'request-row');row.type='button';const main=element('span',undefined,'request-main');main.append(element('small',`${r.id} · ${r.place}`),element('strong',r.title),element('small',`${categories[r.category]} · ${new Date(r.createdAt).toLocaleDateString()}`));row.append(main,element('span',r.priority==='high'?'High':'General',`priority-tag ${r.priority}`),element('span',r.status,'status-tag'));row.addEventListener('click',()=>openReport(r.id));list.append(row);
 if(map){const popup=element('div',undefined,'popup');popup.append(element('strong',r.title),element('span',`${r.place} · ${r.status}`));const button=element('button','View report','text-button');button.addEventListener('click',()=>openReport(r.id));popup.append(button);L.circleMarker([r.lat,r.lng],{radius:r.priority==='high'?9:6,color:r.status==='Resolved'?'#6d952f':r.priority==='high'?'#c96a3e':'#397e8e',fillOpacity:.8,weight:2}).bindPopup(popup).addTo(layers);}}
 if(!visible.length)list.append(element('p','No matching reports. Try a different search or clear the filters.','empty-state'));
 const open=visible.filter(r=>r.status!=='Resolved'),counts=Object.keys(categories).map(key=>({key,count:open.filter(r=>r.category===key).length})).sort((a,b)=>b.count-a.count);
 $('#insight-title').textContent=open.length?`${categories[counts[0].key]} leads the open requests.`:'No open requests in this view.';$('#insight-copy').textContent=open.length?`${counts[0].count} of ${open.length} open reports concern ${categories[counts[0].key].toLowerCase()}. Review these together to identify shared needs. This summary uses your current filters; no external AI is used.`:'Expand the time frame or clear filters to explore more community needs.';
 const bars=$('#category-breakdown');bars.replaceChildren();counts.forEach(({key,count})=>{const line=element('div',undefined,'bar-row');line.append(element('span',categories[key]),element('span',String(count)));const meter=element('progress');meter.max=Math.max(open.length,1);meter.value=count;meter.setAttribute('aria-label',`${categories[key]}: ${count} open reports`);line.append(meter);bars.append(line);});
}
document.querySelectorAll('[data-category]').forEach(chip=>chip.addEventListener('click',()=>{filters.category=chip.dataset.category;render();}));
$('#date-range').addEventListener('change',e=>{filters.days=e.target.value;render();});$('#search').addEventListener('input',e=>{filters.search=e.target.value;render();});$('#status-filter').addEventListener('change',e=>{filters.status=e.target.value;render();});
function clearFilters(){Object.assign(filters,{category:'all',days:'all',status:'all',search:''});$('#date-range').value='all';$('#status-filter').value='all';$('#search').value='';render();}
$('#clear-filters').addEventListener('click',clearFilters);
for(const city of Object.keys(cities))$('#city-select').append(new Option(city,city));
$('#city-select').addEventListener('change',e=>{if(cities[e.target.value]){const [lat,lng]=cities[e.target.value];setPoint(lat,lng);$('#issue-location').value=e.target.value;map?.setView([lat,lng],12);}});
$('#use-coordinates').addEventListener('click',()=>{const lat=Number($('#latitude').value),lng=Number($('#longitude').value);if(!$('#latitude').value||!$('#longitude').value||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){notify('Enter latitude from -90 to 90 and longitude from -180 to 180.');return;}setPoint(lat,lng);map?.setView([lat,lng],12);});
$('#locate-me').addEventListener('click',()=>{if(!navigator.geolocation){notify('Location unavailable. Choose a city or enter coordinates.');return;}const button=$('#locate-me');button.disabled=true;button.textContent='Locating…';navigator.geolocation.getCurrentPosition(position=>{setPoint(position.coords.latitude,position.coords.longitude);map?.setView([selectedPoint.lat,selectedPoint.lng],14);button.disabled=false;button.textContent='Use my location';},()=>{notify('Could not access your location. Choose a city, click the map, or enter coordinates.');button.disabled=false;button.textContent='Use my location';},{timeout:10000});});
$('#issue-form').addEventListener('submit',async event=>{
 event.preventDefault();$('#form-error').textContent='';
 if(backend.sharedMode&&!currentAccount.user){$('#auth-dialog').showModal();$('#auth-message').textContent='Sign in to share a report. Your form will stay here.';return;}
 const data=new FormData(event.currentTarget),title=String(data.get('title')).trim(),place=String(data.get('location')).trim();
 if(title.length<3||place.length<2){$('#form-error').textContent='Enter an issue title (at least 3 characters) and a location name (at least 2).';return;}
 if(!selectedPoint){notify('Choose a city, click the map, or enter coordinates to place your report.');$('#city-select').focus();return;}
 const now=new Date().toISOString(),report={id:pendingReport?.id||`CS-${crypto.randomUUID()}`,title,place,category:data.get('category'),priority:data.get('priority'),description:String(data.get('description')).trim(),...selectedPoint,status:'Submitted',createdAt:now,updatedAt:now,demo:false};
 if(!validReport(report)){notify('Please check the report fields.');return;}
 const button=$('#issue-form button[type=submit]');button.disabled=true;button.textContent='Saving…';
 try{let saved=report;if(backend.sharedMode){pendingReport=report;saved=await backend.createReport(report);reports=[saved,...reports.filter(r=>r.id!==saved.id)];}else if(!persist([report,...reports]))return;
 pendingReport=null;clearFilters();$('#issue-form').hidden=true;$('#success-state').hidden=false;$('#success-message').textContent=backend.sharedMode?`${saved.id} is saved and visible to other visitors. This site is not connected to a public authority.`:`${saved.id} is saved in this browser. It has not been sent to a local authority.`;notify(backend.sharedMode?'Report shared successfully.':'Report saved locally.');draftMarker?.remove();draftMarker=null;map?.setView([saved.lat,saved.lng],12);
 }catch(error){$('#form-error').textContent=`Report was not confirmed saved: ${error.message} Your form is preserved; retry safely.`;}finally{button.disabled=false;button.textContent='Submit issue';}
});
$('#new-issue').addEventListener('click',()=>{$('#issue-form').reset();selectedPoint=null;pendingReport=null;draftMarker?.remove();draftMarker=null;$('#form-error').textContent='';$('#pin-status').textContent='Choose a city or click the map to place a pin.';$('#issue-form').hidden=false;$('#success-state').hidden=true;$('#issue-title').focus();});
$('#save-status').addEventListener('click',async()=>{
 const button=$('#save-status');button.disabled=true;$('#detail-error').textContent='';
 try{if(backend.sharedMode){const updated=await backend.updateStatus(detailReport,$('#detail-status').value,$('#review-note').value);reports=reports.map(r=>r.id===updated.id?updated:r);}else if(!persist(reports.map(r=>r.id===selectedId?{...r,status:$('#detail-status').value,updatedAt:new Date().toISOString()}:r)))return;
 render();$('#detail-dialog').close();notify(backend.sharedMode?'Review saved for everyone.':'Status updated in this browser.');
 }catch(error){$('#detail-error').textContent=error.message;}finally{button.disabled=false;}
});
$('#show-on-map').addEventListener('click',()=>{const r=reports.find(r=>r.id===selectedId);$('#detail-dialog').close();clearFilters();map?.setView([r.lat,r.lng],14);$('#map-section').scrollIntoView({behavior:'smooth'});});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('#export-reports').addEventListener('click',()=>{const data={version:1,exportedAt:new Date().toISOString(),reports:filterReports(reports,filters)},url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=element('a');a.href=url;a.download='civicsignal-reports.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify(`Exported ${data.reports.length} matching reports.`);});
$('#reset-demo').addEventListener('click',()=>$('#reset-dialog').showModal());$('#confirm-reset').addEventListener('click',()=>{if(persist(seedReports())){clearFilters();$('#reset-dialog').close();notify('Sample reports restored.');}});
$('#data-principles').addEventListener('click',()=>$('#privacy-dialog').showModal());
document.querySelectorAll('.main-nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.main-nav a').forEach(a=>a.classList.toggle('active',a===link));}));
function updateAccountUI(){
 $('#account-button').textContent=currentAccount.user?'Account':'Sign in';
 $('#account-summary').textContent=currentAccount.user?`Signed in as ${currentAccount.user.email}${currentAccount.reviewer?' · Reviewer':''}`:'Sign in to submit a community report.';
 $('#auth-form').hidden=Boolean(currentAccount.user);$('#sign-out').hidden=!currentAccount.user;
 $('#auth-open-hint').textContent=currentAccount.user?'Your report will be public. Do not include personal contact details.':'Anyone can browse. Sign in to submit a public report.';
}
async function refreshShared(){
 if(syncing)return;syncing=true;$('#refresh-reports').disabled=true;
 try{currentAccount=await backend.account();updateAccountUI();const incoming=await backend.listReports();if(!incoming.every(validReport))throw Error('The backend returned invalid data.');reports=incoming;render();$('#connection-status').textContent=`Shared reports · refreshed ${new Date().toLocaleTimeString()}`;$('#connection-error').textContent='';}
 catch(error){$('#connection-error').textContent=`Shared service unavailable: ${error.message} Displayed reports may be out of date. Use Refresh to retry.`;$('#connection-status').textContent='Connection needs attention';}
 finally{syncing=false;$('#refresh-reports').disabled=false;}
}
$('#refresh-reports').addEventListener('click',refreshShared);
$('#account-button').addEventListener('click',()=>{$('#auth-message').textContent='';$('#auth-dialog').showModal();});
$('#auth-form').addEventListener('submit',async event=>{
 event.preventDefault();const action=event.submitter?.value||'signin',email=$('#auth-email').value.trim(),password=$('#auth-password').value;
 $('#auth-message').textContent='Please wait…';const buttons=$('#auth-form').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
 try{const result=action==='signup'?await backend.signUp(email,password):await backend.signIn(email,password);$('#auth-password').value='';if(action==='signup'&&!result.session){$('#auth-message').textContent='Account created. Check your email for the confirmation link, then sign in. If mail is unavailable, contact the site operator.';}else{await refreshShared();$('#auth-dialog').close();notify('Signed in.');}}
 catch(error){$('#auth-message').textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
});
$('#forgot-password').addEventListener('click',async()=>{const email=$('#auth-email');if(!email.value||!email.checkValidity()){email.reportValidity();$('#auth-message').textContent='Enter your email address first.';return;}try{await backend.resetPassword(email.value.trim());$('#auth-message').textContent='If this account exists, a password reset link has been requested. Check your email.';}catch(error){$('#auth-message').textContent=error.message;}});
$('#password-form').addEventListener('submit',async event=>{event.preventDefault();try{await backend.changePassword($('#new-password').value);$('#new-password').value='';$('#password-dialog').close();notify('Password updated.');}catch(error){$('#password-message').textContent=error.message;}});
$('#sign-out').addEventListener('click',async()=>{try{await backend.signOut();currentAccount={user:null,reviewer:false};updateAccountUI();$('#auth-dialog').close();await refreshShared();notify('Signed out.');}catch(error){$('#auth-message').textContent=error.message;}});
$('#delete-report').addEventListener('click',()=>$('#delete-dialog').showModal());
$('#confirm-delete').addEventListener('click',async()=>{
 const button=$('#confirm-delete');button.disabled=true;$('#delete-error').textContent='';
 try{if(backend.sharedMode)await backend.deleteReport(detailReport);else if(!persist(reports.filter(r=>r.id!==selectedId)))return;
 reports=reports.filter(r=>r.id!==selectedId);render();$('#delete-dialog').close();$('#detail-dialog').close();notify('Report removed.');
 }catch(error){$('#delete-error').textContent=error.message;}finally{button.disabled=false;}
});
render();
if(backend.sharedMode){
 $('.demo-badge').textContent='Community pilot';$('.demo-notice').textContent='Shared community reports. Sign in to contribute; assigned reviewers can update status. This site is not connected to a public authority.';
 $('.updated').replaceChildren(element('strong','Connecting…'));$('.updated strong').id='connection-status';$('.coverage-stamp strong').textContent='Community infrastructure';$('.coverage-stamp small').textContent='A shared picture of local needs';
 $('.metric-primary .metric-foot').textContent='All shared reports';$('.voice-badge').textContent='Shared reports';$('.privacy-note').textContent='Public community report';$('.insight-note').textContent='Community-submitted information. Review status reflects this site’s reviewers, not an official government response.';
 $('#reset-demo').hidden=true;$('#account-button').hidden=false;$('#refresh-reports').hidden=false;$('#auth-open-hint').hidden=false;
 $('#privacy-title').textContent='How shared reports work';$('#privacy-body').textContent='Reports, map coordinates, and review notes are public. Your email address is used for sign-in and is not included in the public reports API. Supabase stores reports and account data; its session is remembered in this browser. Authors can delete their own reports, and assigned reviewers can remove any report. Do not submit personal contact details or sensitive information. Contact the site operator for account deletion.';
 $('#privacy-scope').textContent='Submissions are limited to 10 per account per 24 hours. Reviewers are assigned by the site operator. Changes are recorded in each report’s public history. Deleting a report also removes its history; quota timestamps are retained temporarily.';
 try{await backend.onAuthChange(async event=>{if(event==='PASSWORD_RECOVERY')$('#password-dialog').showModal();await refreshShared();});}catch(error){$('#connection-error').textContent=error.message;}await refreshShared();
 setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]'))refreshShared();},60000);
}else if(!storageAvailable){notify('Saved data could not be read. Sample reports are displayed. Saving will replace the unreadable data.');}
