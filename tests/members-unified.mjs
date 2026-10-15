import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({executablePath: process.env.GYMDESK_BROWSER_PATH});
try {
 for (const width of [1440,390]) {
  const page = await browser.newPage({viewport:{width,height:900}});
  await page.goto(process.env.GYMDESK_TEST_URL || 'http://localhost:5173');
  await page.getByRole('button',{name:'Explore demo workspace',exact:true}).click();
  if(width===390) await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Memberships',exact:true}).count(),0);
  await page.getByRole('button',{name:'Members',exact:true}).click();
  const filter=page.getByLabel('Member status filter');
  for(const value of ['Active','Expiring soon','Expired','Pending fees','All']) await filter.selectOption(value);
  await page.getByRole('button',{name:'Renew',exact:true}).first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:/^Open /}).filter({hasNotText:'navigation'}).last().click();
  await page.getByRole('heading',{name:'Membership history',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Edit membership',exact:true}).first().isVisible());
  assert(await page.getByRole('heading',{name:/Attendance history/}).isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.close();
 }
 console.log('PASS: merged Members navigation, membership filters, renewal popup and member profile on desktop and phone.');
} finally {await browser.close();}
