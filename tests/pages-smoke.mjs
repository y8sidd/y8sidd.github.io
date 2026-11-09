import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
const vite=resolve('node_modules/vite/bin/vite.js');
const api='https://repomentor-api.test';
await new Promise((done,fail)=>{
 const build=spawn(process.execPath,[vite,'build','--outDir','.pages-test'],{stdio:'inherit',env:{...process.env,VITE_GITHUB_PAGES:'true',VITE_API_BASE_URL:api,VITE_TURNSTILE_SITE_KEY:''}});
 build.on('error',fail);build.on('exit',code=>code===0?done():fail(new Error('Pages build failed')));
});
const server=spawn(process.execPath,[vite,'preview','--outDir','.pages-test','--host','127.0.0.1','--port','4178','--strictPort'],{stdio:'pipe'});
let browser;
const origin='http://127.0.0.1:4178';
const graph={repository:{id:'alice/pages-check',owner:'alice',name:'pages-check',description:'Pages routing fixture',githubUrl:'https://github.com/alice/pages-check',commitSha:'a'.repeat(40),analysisStatus:'ready'},sources:[],nodes:[{id:'/',label:'pages-check',path:'/',type:'repository',parentId:null,summary:'Repository',evidenceRefs:[]},{id:'main.ts',label:'main.ts',path:'main.ts',type:'entry',parentId:'/',summary:'Entry',evidenceRefs:['source:main.ts'],sourceAvailable:true}],edges:[{id:'main',source:'/',target:'main.ts',type:'contains',verification:'verified',evidenceRefs:[]}]};
try{
 let ready=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw new Error('Preview server exited');
  try{ready=(await fetch(origin)).ok;}catch{}
  if(ready)break;await delay(150);
 }
 assert.ok(ready,'Preview did not start');
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({reducedMotion:'reduce'});const errors=[];let sessions=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route(api+'/**',async route=>{
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Session-Token','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(route.request().url().endsWith('/v1/sessions')){sessions++;return route.fulfill({headers,json:{sessionId:'a'.repeat(64),expiresAt:Date.now()+900000,graph}});}
  return route.fulfill({headers,json:{closed:true}});
 });
 await page.goto(origin+'/#/explore/alice/pages-check');
 await page.locator('.explore-page.scene-ui-ready').waitFor({state:'visible'});
 await page.locator('.constellation-canvas canvas').waitFor({state:'visible'});
 await page.reload();
 await page.locator('.explore-page.scene-ui-ready').waitFor({state:'visible'});
 assert.ok(sessions>=2,'A fresh session must load after a full refresh');
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'.pages-test/pages-smoke.png'});
 console.log('Pages production smoke passed: HTTPS API configuration, hash-route deep link, refresh and rendered constellation.');
}finally{await browser?.close();server.kill('SIGTERM');}
