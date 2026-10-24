import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launch,connect,read} from './live-harness.mjs';
import {seed} from './fixtures.ts';
const screens=['Dashboard','Members','Fees & receipts','Attendance','Reminders','Settings','Reports','Audit'];
const results=[],failures=[],writeAttempts=[];
await mkdir('tests/artifacts/live-review',{recursive:true});await mkdir('artifacts',{recursive:true});
const browser=await launch();
let counts;
try {
 for(const role of ['owner','staff']) {
  const email=role+'@gym.local';
  const client=await connect(email,'password123');
  const data=await read(client);
  if(role==='owner'){
   const ids=new Set(data.members.map(m=>m.id));
   counts={members:data.members.length,memberships:data.memberships.length,payments:data.payments.length,visits:data.attendance.length,plans:data.plans.length};
   assert(data.memberships.every(s=>ids.has(s.memberId)&&s.start<=s.end));
   assert(data.payments.every(p=>ids.has(p.memberId)&&data.memberships.some(s=>s.id===p.membershipId)&&p.amount>0));
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  await page.route('**/rest/v1/rpc/gym_action',r=>{writeAttempts.push(r.request().url());return r.abort();});
  await page.route('**/api/whatsapp/**',r=>{writeAttempts.push(r.request().url());return r.abort();});
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.getByLabel('Email address').fill(email);await page.getByLabel('Password').fill('password123');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  const nav=async name=>{const toggle=page.getByRole('button',{name:'Open navigation',exact:true});if(await toggle.isVisible())await toggle.click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,exact:true,level:1}).waitFor();};
  if(role==='staff')assert.equal(await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Audit',exact:true}).count(),0);
  for(const theme of ['light','dark']){
   if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:`Switch to ${theme} theme`,exact:true}).click();
   for(const width of [1440,1024,768,390,360]){
    await page.setViewportSize({width,height:1000});
    for(const name of screens.filter(n=>role==='owner'||n!=='Audit')){
     const result={role,theme,width,page:name,status:'pass'};
     try{
      await nav(name);await page.evaluate(()=>window.scrollTo(0,0));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} horizontal overflow at ${width}`);
      assert.deepEqual(errors,[]);
      if(role==='owner'&&[1440,390].includes(width)){
       const file=`${name.toLowerCase().replace(/[^a-z]+/g,'-')}-${theme}-${width}.png`;
       await page.screenshot({path:'tests/artifacts/live-review/'+file,fullPage:false,animations:'disabled'});result.screenshot=file;
      }
      if(name==='Members'){
       const member=data.members.find(m=>!m.archived);
       if(member){await page.getByRole('textbox',{name:'Search name, phone or member ID'}).fill(member.name);await page.getByRole('button',{name:'Open '+member.name,exact:true}).first().click();for(const tab of ['Overview','Memberships','Payments','Attendance']){await page.getByRole('tab',{name:tab,exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}await page.getByRole('button',{name:'Back to Members',exact:true}).click();}
      }
      if(name==='Reminders')for(const tab of ['Manual','Automated','Delivery log']){await page.getByRole('tab',{name:tab,exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
     }catch(e){result.status='fail';result.error=e.message;failures.push(result);}
     results.push(result);
    }
   }
  }
  await page.getByRole('button',{name:'Open navigation',exact:true}).isVisible().then(async visible=>{if(visible)await page.getByRole('button',{name:'Open navigation',exact:true}).click();});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  assert.equal(await page.locator('.app').count(),0,'Sign-out removes workspace data from the screen');
  await context.close();
 }
 // Empty data must render every page and guide users toward setup rather than crash.
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),empty=seed();
 Object.assign(empty,{members:[],memberships:[],payments:[],attendance:[],plans:[],reminders:[],audit:[]});
 const user={id:'10000000-0000-4000-8000-000000000001',email:'empty@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
 const token=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'test'].join('.');
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
 await page.route('**/auth/v1/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(r.request().url().includes('/token')?{access_token:token,refresh_token:'test',token_type:'bearer',expires_in:3600,user}:user)}));
 await page.route('**/rest/v1/rpc/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(r.request().url().endsWith('my_role')?'owner':empty)}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password').fill('test');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
 for(const name of screens){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,exact:true,level:1}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push({role:'empty fixture',theme:'light',width:390,page:name,status:'pass'});}
 assert.deepEqual(errors,[]);await context.close();
 assert.deepEqual(writeAttempts,[],'Read-only audit must not change any gym records');
}finally{
 await browser.close();
 const report={date:'2026-10-23',counts,cases:results.length,failures,results,writeAttempts:writeAttempts.length};
 await writeFile('tests/artifacts/live-review/report.json',JSON.stringify(report,null,2));
 const escape=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const rows=results.map(r=>`<tr><td>${escape(r.role)}</td><td>${escape(r.page)}</td><td>${r.width}px</td><td>${r.theme}</td><td>${r.status}</td><td>${r.screenshot?`<a href="../tests/artifacts/live-review/${r.screenshot}">Screenshot</a>`:''}</td></tr>`).join('');
 await writeFile('artifacts/app-audit-2026-10-23.html',`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>NGF app audit</title><style>body{font:15px/1.6 system-ui;max-width:1100px;margin:32px auto;padding:0 20px;color:#29272d;background:#f7f6f7}h1{font-size:26px}table{border-collapse:collapse;width:100%;background:white}td,th{text-align:left;padding:9px 12px;border-bottom:1px solid #e4e1e6}a{color:#b31f31}.note{padding:16px;background:white;border-radius:10px;margin-bottom:20px}</style><h1>NGF — complete app audit</h1><p>23 October 2026 · Desktop, tablet and mobile · Light and dark themes</p><div class="note"><strong>${results.length} page/layout cases · ${failures.length} failures</strong><p>Local data read-only: ${counts?.members||0} members, ${counts?.memberships||0} memberships, ${counts?.payments||0} payments. No gym records changed. Write operations are verified separately using synthetic browser data and the isolated database tests. Actual WhatsApp delivery and payment-provider settlement are outside this audit.</p></div><table><thead><tr><th>Role</th><th>Page</th><th>Width</th><th>Theme</th><th>Result</th><th>Preview</th></tr></thead><tbody>${rows}</tbody></table>`);
}
assert.deepEqual(failures,[]);console.log(`PASS: ${results.length} read-only local-data and empty-state page cases; owner/staff, five screen widths, both themes, member tabs, reminders and sign-out. No records changed.`);
