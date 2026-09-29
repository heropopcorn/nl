import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { chromium, expect } from '@playwright/test';

test('static preview works without workspace APIs and hides excluded default resources', {timeout:40000},async()=>{
  const probe=http.createServer(); await new Promise(r=>probe.listen(0,'127.0.0.1',r)); const port=probe.address().port; await new Promise(r=>probe.close(r));
  const secret='preview-browser-test-secret-000000000000000';
  const child=spawn(process.execPath,['apps/director-web/server.mjs'],{env:{...process.env,NL_MODE:'preview',PORT:String(port),AUTH_SECRET:secret},stdio:['ignore','pipe','pipe']});
  let log=''; child.stdout.on('data',d=>{log+=d;}); child.stderr.on('data',d=>{log+=d;});
  const base=`http://127.0.0.1:${port}`; let browser;
  try {
    await expect.poll(()=>log).toContain('导演台：http');
    browser=await chromium.launch({args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context=await browser.newContext(); const expires=String(Date.now()+3600000);
    await context.addCookies([{name:'director_session',value:expires+'.'+createHmac('sha256',secret).update(expires).digest('base64url'),url:base}]);
    const page=await context.newPage(); const apis=[]; page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apis.push(r.url());});
    await page.goto(base); await expect(page.locator('footer')).toContainText('影棚已就绪');
    await expect(page.locator('.badge')).toContainText('仅浏览器保存');
    await page.getByRole('button',{name:'更多资源…',exact:true}).click();
    await expect(page.getByRole('button',{name:'东南小村 · 村庄主区地皮',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:/沙漠/})).toHaveCount(0);
    assert.equal(apis.length,0);
    assert.equal((await context.request.get(base+'/api/workspace')).status(),404);
    assert.equal((await context.request.get(base+'/art/nl_ground_desert_dunes.png')).status(),404);
  } finally {await browser?.close(); const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}
});
