import test from 'node:test';
import assert from 'node:assert/strict';
import {seedReports,validReport,filterReports,summarize} from '../data.js';
const now=Date.parse('2026-09-30T12:00:00Z'),reports=seedReports(now);
test('sample reports are valid and have unique IDs',()=>{assert.ok(reports.every(validReport));assert.equal(new Set(reports.map(r=>r.id)).size,reports.length);});
test('filters combine category, age, status, and case-insensitive search',()=>{const result=filterReports(reports,{category:'water',days:7,status:'Submitted',search:'RAIPUR'},now);assert.equal(result.length,2);assert.equal(filterReports(reports,{search:'no matching locality'},now).length,0);});
test('resolved high priority reports leave the open priority count',()=>{const before=summarize(reports);const next=reports.map((r,i)=>i===0?{...r,status:'Resolved'}:r);assert.equal(summarize(next).high,before.high-1);assert.equal(summarize(next).resolved,before.resolved+1);});
test('invalid persisted data is rejected',()=>{for(const change of [{lat:NaN},{lng:181},{title:''},{category:'__proto__'},{status:'approved'},{createdAt:'invalid'},{description:'x'.repeat(2001)}])assert.equal(validReport({...reports[0],...change}),false);});
