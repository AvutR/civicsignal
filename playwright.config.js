import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',use:{baseURL:'http://127.0.0.1:4176',browserName:'chromium',...(process.env.PW_CHANNEL?{channel:process.env.PW_CHANNEL}:{})},webServer:{command:'node scripts/serve.js',url:'http://127.0.0.1:4176',reuseExistingServer:!process.env.CI},reporter:'list'});
