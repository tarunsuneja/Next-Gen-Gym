import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.GYMDESK_BROWSER_PATH});
try{const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://localhost:5173');await page.getByRole('button',{name:'Explore demo workspace',exact:true}).click();
for(const theme of ['light','dark']){
if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:'Switch to '+theme+' theme'}).click();
for(const width of [360,390,430]){
await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'Add member',exact:true}).click();const d=page.getByRole('dialog');assert(await d.evaluate(el=>el.scrollWidth<=el.clientWidth));
assert((await d.locator('.member-photo').boundingBox()).height<160);
assert.equal(await d.locator('details').count(),0);
for(const name of ['gender','height','weight']) await d.locator('[name="'+name+'"]').waitFor({state:'visible'});
if(width===390)await d.screenshot({path:`artifacts/mobile-audit/compact-add-member-${theme}.png`});
for(const height of [844,500]){await page.setViewportSize({width,height});await d.getByLabel('Email',{exact:true}).scrollIntoViewIfNeeded();await d.getByLabel('Email',{exact:true}).fill('test@example.com');await d.getByRole('button',{name:'Save',exact:true}).scrollIntoViewIfNeeded();const box=await d.getByRole('button',{name:'Save',exact:true}).boundingBox();assert(box.y>=0&&box.y+box.height<=height);}
await d.getByRole('button',{name:'Cancel',exact:true}).click();
}}
console.log('PASS: compact add member in both themes at 360/390/430px and shortened viewport; fields and save reachable.');}finally{await browser.close();}

