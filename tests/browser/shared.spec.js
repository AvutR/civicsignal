import {test,expect} from '@playwright/test';

// Exercise the real Supabase browser SDK against a deterministic HTTP fixture.
// Database permissions and RPC SQL are executed separately in backend.test.js.
async function sharedFixture(browser) {
  const reports=[];
  const history=new Map();
  let failCreate=false;
  let failFinish=false;
  const attachments=new Map(),uploaded=new Set();
  const users={
    'author@example.test':{id:'11111111-1111-4111-8111-111111111111',email:'author@example.test',aud:'authenticated',role:'authenticated'},
    'reviewer@example.test':{id:'22222222-2222-4222-8222-222222222222',email:'reviewer@example.test',aud:'authenticated',role:'authenticated'}
  };
  const contexts=[];
  async function open() {
    const context=await browser.newContext();contexts.push(context);
    await context.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:`export const config={supabaseUrl:'https://civic-test.supabase.co',supabasePublishableKey:'sb_publishable_test'};`}));
    await context.route('https://civic-test.supabase.co/**',async route=>{
      const req=route.request(),url=new URL(req.url());
      const body=req.headers()['content-type']?.includes('application/json')?(req.postDataJSON()||{}):{};
      const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET, POST, PUT, OPTIONS'};
      const send=(json,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(json)});
      if(req.method()==='OPTIONS')return send({});
      if(url.pathname.startsWith('/storage/v1/object/sign/')&&req.method()==='POST')return send({signedURL:url.pathname.replace('/storage/v1','')+'?token=test'});
      if(url.pathname.startsWith('/storage/v1/object/sign/')&&req.method()==='GET')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=','base64')});
      if(url.pathname.startsWith('/storage/v1/object/civic-media/')){if(uploaded.has(url.pathname))return send({statusCode:'409',error:'Duplicate',message:'The resource already exists'},409);uploaded.add(url.pathname);return send({Key:url.pathname.replace('/storage/v1/object/',''),Id:'fixture'});}
      const token=req.headers().authorization?.slice(7);
      let user;
      try {user=users[JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).email];}catch{}
      if(url.pathname==='/auth/v1/token'){
        const account=users[body.email];if(!account)return send({msg:'Invalid login credentials'},400);
        const payload=Buffer.from(JSON.stringify({sub:account.id,email:account.email,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url');
        return send({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,token_type:'bearer',expires_in:3600,refresh_token:'test-refresh',user:account});
      }
      if(url.pathname==='/auth/v1/user')return send(user||{message:'Unauthorized'},user?200:401);
      if(url.pathname==='/auth/v1/logout')return send({});
      const name=url.pathname.split('/').at(-1),reviewer=user?.email==='reviewer@example.test';
      if(name==='is_reviewer')return send(reviewer);
      if(name==='list_reports')return send(reports.map(r=>({...r,canDelete:reviewer||r._owner===user?.id})).map(({_owner,...r})=>r));
      if(name==='report_history')return send(history.get(`CS-${body.p_id}`)||[]);
      if(name==='reserve_media'){const existing=attachments.get(body.p_id);if(existing)return send(existing);const m={id:body.p_id,reportId:body.p_report_id,kind:body.p_kind,mime:body.p_mime,size:body.p_size,path:`${body.p_report_id}/${body.p_id}.jpg`,ready:false};attachments.set(m.id,m);return send(m);}
      if(name==='finish_media'){if(failFinish)return send({message:'Upload confirmation unavailable'},503);const m=attachments.get(body.p_id);m.ready=true;const r=reports.find(r=>r.id===`CS-${m.reportId}`);r.mediaCounts={image:[...attachments.values()].filter(a=>a.reportId===m.reportId&&a.ready&&a.kind==='image').length,audio:0};return send(null);}
      if(name==='list_media')return send([...attachments.values()].filter(m=>m.reportId===body.p_report_id&&m.ready));
      if(name==='create_report'){
        if(!user)return send({message:'Sign in first'},403);
        if(failCreate)return send({message:'Database temporarily unavailable'},503);
        const r={...body.p_report,_owner:user.id,revision:1,canDelete:true,status:'Submitted'};
        if(!reports.some(item=>item.id===r.id))reports.unshift(r);
        history.set(r.id,[{status:'Submitted',note:'Report received.',createdAt:r.createdAt}]);
        const {_owner,...publicReport}=r;return send(publicReport);
      }
      if(name==='review_report'){
        if(!reviewer)return send({message:'Only an assigned reviewer can change report status.'},403);
        const r=reports.find(r=>r.id===`CS-${body.p_id}`);
        if(r.revision!==body.p_revision)return send({message:'This report changed. Refresh before reviewing it.'},409);
        if(body.p_note.length<3)return send({message:'Add a review note (3-1000 characters).'},400);
        Object.assign(r,{status:body.p_status,revision:r.revision+1,updatedAt:new Date().toISOString()});
        history.get(r.id).unshift({status:r.status,note:body.p_note,createdAt:r.updatedAt});
        const {_owner,...publicReport}=r;return send({...publicReport,canDelete:true});
      }
      if(name==='delete_report'){
        const index=reports.findIndex(r=>r.id===`CS-${body.p_id}`);
        if(index<0||(!reviewer&&reports[index]._owner!==user?.id))return send({message:'Cannot remove this report.'},403);
        reports.splice(index,1);return send(null);
      }
      return send({message:`Unexpected endpoint: ${url.pathname}`},404);
    });
    const page=await context.newPage();await page.goto('/');await expect(page.locator('#connection-status')).toContainText('refreshed');return page;
  }
  return {open,reports,setFailCreate:value=>{failCreate=value;},setFailFinish:value=>{failFinish=value;},close:()=>Promise.all(contexts.map(c=>c.close()))};
}
async function login(page,email){
  await page.locator('#account-button').click();await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill('fixture-password');await page.locator('#auth-form button[value=signin]').click();await expect(page.locator('#auth-dialog')).not.toBeVisible();
}
async function fillReport(page){await page.locator('#issue-title').fill('Shared damaged pavement');await page.locator('#city-select').selectOption('Pune');await page.locator('#issue-description').fill('Uneven paving outside the community centre.');}
test('shared report is visible across browsers; only reviewer can change status; author can delete',async({browser})=>{
  const fixture=await sharedFixture(browser);
  try{
    const author=await fixture.open();await expect(author.locator('#total-count')).toHaveText('0');await expect(author.locator('#reset-demo')).toBeHidden();
    await login(author,'author@example.test');await fillReport(author);await author.locator('#issue-form button[type=submit]').click();await expect(author.locator('#success-message')).toContainText('visible to other visitors');
    const visitor=await fixture.open();await expect(visitor.locator('#total-count')).toHaveText('1');await visitor.locator('.request-row').click();await expect(visitor.locator('#save-status')).toBeHidden();await expect(visitor.locator('#delete-report')).toBeHidden();await visitor.locator('#detail-dialog [data-close]').click();
    const reviewer=await fixture.open();await login(reviewer,'reviewer@example.test');await reviewer.locator('.request-row').click();await reviewer.locator('#detail-status').selectOption('In progress');await reviewer.locator('#review-note').fill('Inspection scheduled for tomorrow.');await reviewer.locator('#save-status').click();await expect(reviewer.locator('#detail-dialog')).not.toBeVisible();
    await author.locator('#refresh-reports').click();await expect(author.locator('.status-tag')).toHaveText('In progress');await author.locator('.request-row').click();await expect(author.locator('#save-status')).toBeHidden();await expect(author.locator('#report-history')).toContainText('Inspection scheduled for tomorrow.');await author.locator('#delete-report').click();await author.locator('#confirm-delete').click();await expect(author.locator('#total-count')).toHaveText('0');
    await visitor.locator('#refresh-reports').click();await expect(visitor.locator('#total-count')).toHaveText('0');
  }finally{await fixture.close();}
});
test('shared service failure preserves form and never pretends to save locally',async({browser})=>{
  const fixture=await sharedFixture(browser);
  try{const page=await fixture.open();await login(page,'author@example.test');await fillReport(page);fixture.setFailCreate(true);await page.locator('#issue-form button[type=submit]').click();await expect(page.locator('#form-error')).toContainText('not confirmed saved');await expect(page.locator('#issue-title')).toHaveValue('Shared damaged pavement');await expect(page.locator('#success-state')).toBeHidden();await expect(page.locator('#total-count')).toHaveText('0');fixture.setFailCreate(false);await page.locator('#issue-form button[type=submit]').click();await expect(page.locator('#success-state')).toBeVisible();expect(fixture.reports).toHaveLength(1);}finally{await fixture.close();}
});
test('signed-out submission asks for sign-in without discarding the draft',async({browser})=>{
  const fixture=await sharedFixture(browser);
  try{const page=await fixture.open();await fillReport(page);await page.locator('#issue-form button[type=submit]').click();await expect(page.locator('#auth-dialog')).toBeVisible();await page.locator('#auth-dialog [data-close]').click();await expect(page.locator('#issue-title')).toHaveValue('Shared damaged pavement');expect(fixture.reports).toHaveLength(0);}finally{await fixture.close();}
});
test('shared photo upload retries after a lost confirmation and appears in another browser',async({browser})=>{
  const fixture=await sharedFixture(browser);
  try{
    const author=await fixture.open();await login(author,'author@example.test');await fillReport(author);
    const png=await author.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=10;canvas.height=10;return canvas.toDataURL('image/png').split(',')[1];});
    await author.locator('#photo-files').setInputFiles({name:'issue.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(author.locator('#attachment-previews img')).toHaveCount(1);
    fixture.setFailFinish(true);await author.locator('#issue-form button[type=submit]').click();await expect(author.locator('#form-error')).toContainText('all attachments');await expect(author.locator('#success-state')).toBeHidden();
    fixture.setFailFinish(false);await author.locator('#issue-form button[type=submit]').click();await expect(author.locator('#success-state')).toBeVisible();expect(fixture.reports).toHaveLength(1);
    const visitor=await fixture.open();await expect(visitor.locator('.request-row')).toContainText('1 photo');await visitor.locator('.request-row').click();await expect(visitor.locator('#detail-media img')).toHaveCount(1);await expect(visitor.locator('#detail-media img')).toHaveAttribute('src',/storage\/v1\/object\/sign/);
  }finally{await fixture.close();}
});
