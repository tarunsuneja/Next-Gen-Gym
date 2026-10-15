import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.GYMDESK_BROWSER_PATH});
try {const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://localhost:5173');
assert((await page.locator('link[rel="icon"]').first().getAttribute('href')).includes('favicon-32'));
const href=await page.locator('link[rel="manifest"]').getAttribute('href');const manifest=await (await page.request.get('http://localhost:5173'+href)).json();
for(const icon of [...manifest.icons,{src:await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')}]){const res=await page.request.get('http://localhost:5173'+icon.src);assert(res.ok());assert((res.headers()['content-type']||'').includes('image/png'));}
await page.getByRole('button',{name:'Explore demo workspace',exact:true}).click();
await page.evaluate(()=>{window.__installPrompt={prompt:async()=>{},userChoice:Promise.resolve({outcome:'dismissed'})};window.dispatchEvent(new Event('ngf-install-ready'));});
const prompt=page.getByRole('dialog',{name:'Install app'});await prompt.waitFor();assert(await prompt.getByAltText('NGF Gym',{exact:true}).isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await prompt.screenshot({path:'artifacts/install-logo-review.png'});console.log('PASS: browser favicon, manifest icons, Apple icon and mobile install banner.');}finally{await browser.close();}
