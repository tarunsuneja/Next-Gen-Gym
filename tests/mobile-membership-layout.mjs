import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.GYMDESK_BROWSER_PATH});
try {
 const page=await browser.newPage({viewport:{width:390,height:900}});
 await page.goto('http://localhost:5173');
 await page.getByRole('button',{name:'Explore demo workspace',exact:true}).click();
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await page.getByRole('button',{name:'Members',exact:true}).click();
 await page.locator('.member-cell').first().click();
 for(const width of [360,390,430]) {
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const rows=page.locator('.membership-history-entry');
  assert(await rows.count()>0);
  for(const row of await rows.all()) {
   assert(await row.evaluate(el=>el.scrollWidth<=el.clientWidth));
   for(const button of await row.getByRole('button').all()) {
    const box=await button.boundingBox();
    assert(box.height>=44 && box.x>=0 && box.x+box.width<=width);
   }
  }
 }
 await page.setViewportSize({width:390,height:900});
 await page.screenshot({path:'artifacts/mobile-profile-review.png',fullPage:true,animations:'disabled'});
 await page.locator('.membership-history-entry').first().screenshot({path:'artifacts/mobile-membership-review.png'});
 console.log('PASS: membership details and full action buttons fit at 360/390/430px.');
} finally {await browser.close();}
