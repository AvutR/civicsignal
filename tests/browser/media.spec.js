import {test,expect} from '@playwright/test';
test.use({permissions:['microphone'],launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});

async function photo(page){const data=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=40;canvas.height=30;const ctx=canvas.getContext('2d');ctx.fillStyle='#679b46';ctx.fillRect(0,0,40,30);return canvas.toDataURL('image/png').split(',')[1];});return {name:'evidence.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};}
function wav(){const sampleCount=8000;const buffer=Buffer.alloc(44+sampleCount*2);buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(sampleCount*2,40);return {name:'voice.wav',mimeType:'audio/wav',buffer};}
test('photo, audio and governance text persist and play after reload',async({page})=>{
 await page.goto('/');await page.locator('#issue-title').fill('Public office closed during opening hours');await page.locator('#city-select').selectOption('Pune');await page.locator('#issue-category').selectOption('governance');await page.locator('#issue-description').fill('Residents were waiting outside the service counter.');
 await page.locator('#photo-files').setInputFiles(await photo(page));await expect(page.locator('#attachment-previews img')).toHaveCount(1);
 await page.locator('#audio-file').setInputFiles(wav());await expect(page.locator('#attachment-previews audio')).toHaveCount(1);
 await page.locator('#issue-form button[type=submit]').click();await expect(page.locator('#success-state')).toBeVisible();await page.reload();
 await page.locator('#search').fill('Public office');await expect(page.locator('.request-row')).toContainText('1 photo');await expect(page.locator('.request-row')).toContainText('Audio');await expect(page.locator('.media-map-pin')).toHaveCount(1);await page.locator('.request-row').click();
 await expect(page.locator('#detail-media img')).toHaveCount(1);await expect(page.locator('#detail-media audio')).toHaveCount(1);
 await page.waitForFunction(()=>document.querySelector('#detail-media img')?.naturalWidth===40);await page.waitForFunction(()=>document.querySelector('#detail-media audio')?.readyState>=1);
 await page.locator('#detail-media audio').evaluate(audio=>audio.play());await expect(page.locator('#detail-media audio')).toHaveJSProperty('paused',false);
 await page.locator('#delete-report').click();await page.locator('#confirm-delete').click();await expect(page.locator('.request-row')).toHaveCount(0);
});
test('unsupported files and attachment count limits have useful errors',async({page})=>{
 await page.goto('/');await page.locator('#photo-files').setInputFiles({name:'vector.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.locator('#form-error')).toContainText('JPG, PNG, or WebP');
 const image=await photo(page);await page.locator('#photo-files').setInputFiles([image,image,image,image]);await expect(page.locator('#form-error')).toContainText('up to 3 photos');await expect(page.locator('#attachment-previews img')).toHaveCount(3);
});
test('microphone records a playable note and stops the capture track',async({page})=>{
 await page.goto('/');await page.locator('#record-audio').click();await expect(page.locator('#stop-recording')).toBeVisible();await expect(page.locator('#issue-form button[type=submit]')).toBeDisabled();
 await page.waitForTimeout(700);await page.locator('#stop-recording').click();await expect(page.locator('#attachment-previews audio')).toHaveCount(1);await expect(page.locator('#stop-recording')).toBeHidden();await expect(page.locator('#recording-status')).toContainText('Recorded');await expect(page.locator('#issue-form button[type=submit]')).toBeEnabled();
});
