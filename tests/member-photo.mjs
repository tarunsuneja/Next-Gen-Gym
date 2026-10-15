import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.GYMDESK_BROWSER_PATH});
try {
const page=await browser.newPage({viewport:{width:390,height:900}});
await page.goto('http://localhost:5173');
const photo=await page.screenshot();
await page.getByRole('button',{name:'Explore demo workspace',exact:true}).click();
await page.getByRole('button',{name:'Add member',exact:true}).click();
let dialog=page.getByRole('dialog');
await dialog.getByLabel('Full name').fill('Photo Test Member');
await dialog.getByLabel('Phone number',{exact:true}).fill('9876540123');
const upload=dialog.getByLabel('Upload profile photo');
await upload.setInputFiles({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
await dialog.getByText('Choose a JPG, PNG or WebP image.',{exact:true}).waitFor();
await upload.setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:photo});
await dialog.getByAltText('Member photo preview').waitFor();
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await dialog.getByRole('button',{name:'Save',exact:true}).click();
await dialog.waitFor({state:'hidden'});
assert(await page.locator('.profile-summary .avatar img').isVisible());
await page.getByRole('button',{name:'Edit member',exact:true}).click();
await dialog.getByAltText('Member photo preview').waitFor();
await dialog.getByRole('button',{name:'Remove photo',exact:true}).click();
await dialog.getByRole('button',{name:'Save',exact:true}).click();
await dialog.waitFor({state:'hidden'});
assert.equal(await page.locator('.profile-summary .avatar img').count(),0);
console.log('PASS: mobile photo validation, upload, preview, save, edit and removal.');
}finally{await browser.close();}
