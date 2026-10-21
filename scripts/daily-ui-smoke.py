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
  current={'schedule':'毎日07:40（日本時間）','lastRun':None}
  def state_route(route):
   response=route.fetch();data=response.json();data['automation']=current;route.fulfill(response=response,json=data)
  page.route('**/api/state',state_route)
  page.goto('http://127.0.0.1:8792');page.locator('#token').fill(token);page.locator('#login-form button').click();page.get_by_role('heading',name='自動監視',exact=True).wait_for();page.get_by_text('初回の定期実行待ち',exact=True).wait_for()
  current['lastRun']={'day':'2026-10-22','startedAt':'2026-10-21T22:40:00.000Z','finishedAt':'2026-10-21T22:40:01.000Z','status':'success','created':1}
  page.get_by_role('button',name='状態を再取得',exact=True).click();page.get_by_text('取得・判定成功',exact=False).wait_for();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors;b.close()
 print('PASS: 390px daily UI initial pending and successful result, no JS errors or overflow (mocked state display)')
finally:p.terminate();p.wait();shutil.rmtree(root)
