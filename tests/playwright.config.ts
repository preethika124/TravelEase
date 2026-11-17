import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./specs',fullyParallel:true,reporter:'list',use:{baseURL:'http://localhost:5173',trace:'on-first-retry'},webServer:{command:'cd .. && npm run dev -w frontend',url:'http://localhost:5173',reuseExistingServer:!process.env.CI,timeout:120_000},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}]});
