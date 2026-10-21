# Run from repository root after npm run build. Requires Python Playwright and Chromium.
import subprocess,tempfile,secrets,time,urllib.request,shutil,os
from playwright.sync_api import sync_playwright
root=tempfile.mkdtemp(prefix='unity-result-');token=secrets.token_urlsafe(40)
script="import {createApp} from './dist/server.js';import {FileStore} from './dist/store.js';import {Engine} from './dist/engine.js';const store=new FileStore(process.argv[1]);await new Engine(store).createAndAdvance({instruction:'イベントの確認結果を整理して',idempotencyKey:'form-smoke-task'});createApp({store,adminToken:process.argv[2]}).listen(8792,'127.0.0.1');"
p=subprocess.Popen(['node','--input-type=module','-e',script,root,token],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(50):
  try:urllib.request.urlopen('http://127.0.0.1:8792/api/health');break
  except Exception:time.sleep(.1)
 with sync_playwright() as pw:
  b=pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page.set_default_timeout(4000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8792');page.locator('#token').fill(token);page.locator('#login-form button').click();page.get_by_role('button',name='タスク',exact=True).click()
  page.get_by_label('確認結果の要約（必須）',exact=True).fill('予約状況を確認。改善効果は未確認。')
  page.get_by_label('確認した根拠（1行1件・最大8件）',exact=True).fill('\n'.join(['根拠']*9));page.get_by_role('button',name='確認結果を保存',exact=True).click();page.get_by_text('根拠は8件以内',exact=False).wait_for();assert page.get_by_label('確認結果の要約（必須）',exact=True).input_value()
  page.get_by_label('確認した根拠（1行1件・最大8件）',exact=True).fill('管理画面の集計を確認\n担当者の記録を照合')
  page.get_by_label('未確認事項（1行1件・最大8件）',exact=True).fill('申込経路は未確認')
  page.get_by_label('次回の確認予定・担当候補（任意）',exact=True).fill('明日の昼に運営担当が再確認')
  page.get_by_role('button',name='確認結果を保存',exact=True).click();page.get_by_role('heading',name='保存された結果（効果は未検証）',exact=True).wait_for()
  page.reload();page.locator('#token').fill(token);page.locator('#login-form button').click();page.get_by_role('button',name='タスク',exact=True).click();page.get_by_text('予約状況を確認。改善効果は未確認。',exact=True).wait_for();page.get_by_text('次回確認（予定・未検証）: 明日の昼に運営担当が再確認',exact=True).wait_for();assert not page.get_by_role('button',name='確認結果を保存',exact=True).count();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors
  data=page.evaluate("fetch('/api/state').then(r=>r.json())");t=data['tasks'][0];assert t['status']=='queued';assert t['steps'][0]['result']['unverified']==['申込経路は未確認','次回確認（予定・未検証）: 明日の昼に運営担当が再確認'];assert data['usage']['aiCalls']==0;b.close()
 print('PASS: 390px form, line limit preserves input, save/reload persisted result and next check, no AI or automatic completion, no JS errors/overflow')
finally:p.terminate();p.wait();shutil.rmtree(root)
