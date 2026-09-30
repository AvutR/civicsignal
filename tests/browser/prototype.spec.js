import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.goto('/');});
test('submit, persist, review and export a report',async({page})=>{
 await expect(page.locator('.leaflet-control-zoom')).toBeVisible();
 await expect(page.locator('.leaflet-interactive')).toHaveCount(10);
 await expect(page.locator('#total-count')).toHaveText('12');
 await page.locator('#issue-title').fill('Broken street light <script>alert(1)</script>');
 await page.locator('#city-select').selectOption('Pune');
 await page.locator('#issue-description').fill('Light outside the library is not working.');
 await page.locator('#issue-form button[type=submit]').click();
 await expect(page.locator('#success-state')).toBeVisible();
 await expect(page.locator('#total-count')).toHaveText('13');
 await page.reload();await expect(page.locator('#total-count')).toHaveText('13');
 await page.locator('#search').fill('Broken street light');await page.locator('.request-row').click();
 await expect(page.locator('#detail-title')).toHaveText('Broken street light <script>alert(1)</script>');
 await page.locator('#detail-status').selectOption('Resolved');await page.locator('#save-status').click();
 await expect(page.locator('#resolved-count')).toHaveText('3');
 const download=page.waitForEvent('download');await page.locator('#export-reports').click();expect((await download).suggestedFilename()).toBe('civicsignal-reports.json');
 await page.reload();await expect(page.locator('#resolved-count')).toHaveText('3');
});
test('filters, empty state, reset confirmation and mobile layout',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-category=education]').click();await expect(page.locator('.request-row')).toHaveCount(2);
 await page.locator('#search').fill('unmatched');await expect(page.locator('.empty-state')).toBeVisible();
 await page.locator('#clear-filters').click();await expect(page.locator('.request-row')).toHaveCount(12);
 await page.locator('#reset-demo').click();await page.locator('#reset-dialog [data-close]').click();await expect(page.locator('#total-count')).toHaveText('12');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('map dependency failure leaves reporting usable',async({page})=>{
 await page.route('**/leaflet.js',route=>route.abort());await page.reload();
 await expect(page.locator('.map-fallback')).toBeVisible();await expect(page.locator('.request-row')).toHaveCount(10);
 await page.locator('#issue-title').fill('Needs a location');await page.locator('#issue-location').fill('Local lane');await page.locator('#issue-form button[type=submit]').click();await expect(page.locator('#toast')).toContainText('place your report');
});
