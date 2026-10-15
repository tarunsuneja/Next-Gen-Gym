import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.GYMDESK_BROWSER_PATH});
const pages=['Dashboard','Members','Fees & receipts','Attendance','Reminders','Messages','Settings','Reports','Audit'];
await mkdir('artifacts/mobile-audit',{recursive:true});
const findings=[];
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173');await page.getByRole('button',{name:'Explore demo workspace',exact:true}).click();
 async function nav(name){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);}
 async function check(label){
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' document overflow');
  const clipped=await page.locator('main').evaluate(root=>[...root.querySelectorAll('button,input,select,textarea,.panel')].filter(el=>{
   const r=el.getBoundingClientRect();if(!r.width||!r.height)return false;
   if(el.closest('.table-scroll,.global-search-trigger'))return false;
   return r.right>innerWidth+2||r.left<0;
  }).map(el=>el.tagName+':'+(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,65)));
  if(clipped.length)findings.push({label,clipped});
 }
 for(const theme of ['light','dark']){
  if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:'Switch to '+theme+' theme'}).click();
  for(const width of [360,390,430]){
   await page.setViewportSize({width,height:844});
   for(const name of pages){await nav(name);await check(`${theme}-${width}-${name}`);if(width===390)await page.screenshot({path:`artifacts/mobile-audit/${theme}-${name.replaceAll(' ','-').replace('&','and')}.png`,fullPage:true,animations:"disabled"});}
  }
 }
 await page.setViewportSize({width:390,height:844});
 await nav('Members');
 await page.getByRole('button',{name:'Add member',exact:true}).click();
 async function modal(label){const dialog=page.getByRole('dialog');await dialog.waitFor();assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),label+' dialog overflow');await dialog.screenshot({path:`artifacts/mobile-audit/${label}.png`});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();}
 await modal('add-member');
 await page.locator('.member-cell').first().click();await check('member-profile');await page.screenshot({path:'artifacts/mobile-audit/member-profile.png',fullPage:true,animations:"disabled"});
 await page.getByRole('button',{name:'Edit member',exact:true}).click();await modal('edit-member');
 await page.getByRole('button',{name:'Renew',exact:true}).first().click();await modal('renew-membership');
 await page.getByRole('button',{name:'Edit membership',exact:true}).first().click();await modal('edit-membership');
 await nav('Fees & receipts');await page.getByRole('button',{name:'Collect payment',exact:true}).click();await modal('collect-payment');
 await nav('Messages');for(const tab of ['Templates','Rules','Log','Setup']){await page.getByRole('button',{name:tab,exact:true}).click();await check('Messages-'+tab);await page.screenshot({path:`artifacts/mobile-audit/messages-${tab}.png`,fullPage:true,animations:"disabled"});}
 assert.deepEqual(errors,[]);assert.deepEqual(findings,[],"Clipped mobile controls");console.log(JSON.stringify({screens:54,findings,errors}));
}finally{await browser.close();}
