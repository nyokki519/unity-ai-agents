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
  entry=page.get_by_label('依頼内容',exact=True)
  entry.fill('入力中の依頼');page.get_by_role('button',name='集客確認テンプレートを入れる',exact=True).click();assert entry.input_value()=='入力中の依頼';page.get_by_text('入力中の依頼を残しています。',exact=False).wait_for()
  entry.fill('');page.get_by_role('button',name='集客確認テンプレートを入れる',exact=True).click();assert '開催日時（日本時間）: 未確認' in entry.input_value();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  entry.fill(entry.input_value().replace('定員: 未確認','定員: 30').replace('予約数・残席: 未確認','予約数・残席: 10 / 20'))
  page.get_by_role('button',name='指示を登録',exact=True).click();page.get_by_role('heading',name='次のイベントの集客改善案を整理して',exact=True).wait_for();assert not errors
  data=page.evaluate("fetch('/api/state').then(r=>r.json())");task=next(t for t in data['tasks'] if t['instruction'].startswith('次のイベント'));assert task['status']=='awaiting_inference';assert task['steps'][0]['agent']=='Marketing';assert '定員: 30' in task['handoff'];assert '【自動添付・Analytics参照データ' in task['handoff'];assert 'Analytics: 未取得' in task['handoff'];assert data['usage']['aiCalls']==0;assert data['usage']['externalApiCalls']==0;b.close()
 print('PASS: 390px template, input protection, edited briefing persisted, Marketing handoff, no external calls or JS errors/overflow')
finally:p.terminate();p.wait();shutil.rmtree(root)
