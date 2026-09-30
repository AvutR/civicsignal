export const categories={water:'Water',roads:'Roads',power:'Power',health:'Health',education:'Education',sanitation:'Sanitation',transport:'Public transport','public-space':'Public spaces',governance:'Governance'};
export const statuses=['Submitted','In review','In progress','Resolved'];
export const cities={Raipur:[21.25,81.63],Mumbai:[19.07,72.88],Nashik:[19.99,73.78],Kolkata:[22.57,88.36],Hyderabad:[17.38,78.49],Jaipur:[26.91,75.79],'New Delhi':[28.61,77.2],Bengaluru:[12.97,77.59],Chennai:[13.08,80.27],Pune:[18.52,73.86]};
export function seedReports(now=Date.now()){
 return [
 ['water','Unreliable community water supply','Raipur','high',2,'Submitted'],
 ['water','Repair public drinking water tap','Nashik','normal',16,'In review'],
 ['roads','Missing crossing near school','Nashik','high',24,'In progress'],
 ['roads','Blocked drains after heavy rain','Mumbai','high',5,'Submitted'],
 ['power','Frequent evening power cuts','Kolkata','high',33,'In review'],
 ['health','Improve access to the local clinic','Hyderabad','normal',61,'Submitted'],
 ['education','School roof repaired','Jaipur','normal',8,'Resolved'],
 ['water','Restore neighbourhood borewell','New Delhi','high',11,'In progress'],
 ['power','Street lighting restored','Bengaluru','normal',3,'Resolved'],
 ['health','Extend clinic opening hours','Chennai','normal',1,'Submitted'],
 ['education','Accessible entrance for library','Pune','normal',6,'In review'],
 ['water','Low water pressure in residential lanes','Raipur','high',4,'Submitted']
 ].map(([category,title,place,priority,days,status],i)=>({id:`CS-${String(i+1).padStart(4,'0')}`,category,title,place,priority,status,description:'Illustrative community report for exploring the prototype. Select a status to try the local review workflow.',lat:cities[place][0]+(i===11?.025:0),lng:cities[place][1],createdAt:new Date(now-days*86400000).toISOString(),updatedAt:new Date(now-days*86400000).toISOString(),demo:true}));
}
export function validReport(r){return !!(r&&typeof r.id==='string'&&typeof r.title==='string'&&r.title.trim().length>0&&r.title.length<=120&&typeof r.place==='string'&&r.place.trim().length>0&&r.place.length<=120&&typeof r.description==='string'&&r.description.length<=2000&&Object.hasOwn(categories,r.category)&&statuses.includes(r.status)&&['high','normal'].includes(r.priority)&&Number.isFinite(r.lat)&&Math.abs(r.lat)<=90&&Number.isFinite(r.lng)&&Math.abs(r.lng)<=180&&Number.isFinite(Date.parse(r.createdAt))&&Number.isFinite(Date.parse(r.updatedAt)));}
export function filterReports(reports,{category='all',days='all',status='all',search=''}={},now=Date.now()){
 return reports.filter(r=>(category==='all'||r.category===category)&&(days==='all'||now-Date.parse(r.createdAt)<=Number(days)*86400000)&&(status==='all'||r.status===status)&&`${r.id} ${r.title} ${r.place} ${r.description}`.toLowerCase().includes(search.toLowerCase().trim()));
}
export function summarize(reports){return {total:reports.length,high:reports.filter(r=>r.priority==='high'&&r.status!=='Resolved').length,resolved:reports.filter(r=>r.status==='Resolved').length,communities:new Set(reports.map(r=>r.place.toLowerCase())).size};}
