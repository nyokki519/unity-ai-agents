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
  current={'schedule':'毎日07:40（日本時間）','lastRun':None,'health':{'level':'waiting','issues':[]}}
  def state_route(route):
   response=route.fetch();data=response.json();data['automation']=current;data['analyticsComparison']={'previousObservedAt':'2026-10-20T22:40:00.000Z','currentObservedAt':'2026-10-21T22:40:00.000Z','note':'同じ対象の差分です。因果は未検証。','metrics':[{'name':'bookings','comparable':True,'previous':3,'current':5,'delta':2,'reason':'ready'},{'name':'attendance','comparable':False,'previous':None,'current':None,'delta':None,'reason':'scope_changed'}]} if current['lastRun'] else data['analyticsComparison'];data['freeAIConfigured']=True;data['freeAI']={'utcDay':'2026-10-21','startedAt':'2026-10-21T22:40:00.000Z','finishedAt':'2026-10-21T22:40:01.000Z','sourceAt':'2026-10-21T22:40:00.000Z','status':'succeeded','reason':None,'result':{'summary':'集計の確認を優先','proposals':[{'action':'告知状況を確認','reason':'未確認のため','effect':'判断材料を整理','effort':'low','risk':'効果は未検証','verification':'日時を記録'}],'unverified':['個別イベントは未特定']}} if current['lastRun'] else None;
   if current['health']['level']=='attention':data['freeAI']['status']='failed';data['freeAI']['reason']='provider_error';data['freeAI']['result']=None
   if os.environ.get('DESIGN_CAPTURE_DIR'):
    d=data['operationsDigest'];d.update(sourceStatus='usable',headline='保存済みの観測データから確認事項を整理しました。',observedAt='2026-10-21T22:40:00.000Z',updatedAt='2026-10-21T22:40:00.000Z',contextFact='対象: 8イベント（過去5 / 予定3）',metrics=[{'label':'予約合計','value':1234,'knownEvents':8,'totalEvents':8},{'label':'実参加合計','value':None,'knownEvents':0,'totalEvents':5},{'label':'PV累計合計','value':4567,'knownEvents':6,'totalEvents':8}],supportingFacts=['収益・リピート率・満足度は未取得。差分は施策の因果や期間流入・転換率を示しません。'],priorities=[{'code':'booking_check','message':'開催間近の予約確認候補が2件あります。定員・募集状況・告知履歴を照合してください。','target':'連携状況'}])
   route.fulfill(response=response,json=data)
  page.route('**/api/state',state_route)
  page.goto('http://127.0.0.1:8792');page.locator('#token').fill(token);page.locator('#login-form button').click();page.get_by_role('heading',name='日次運営サマリー',exact=False).wait_for();
  if os.environ.get('DESIGN_CAPTURE_DIR'):
   os.makedirs(os.environ['DESIGN_CAPTURE_DIR'],exist_ok=True);assert page.locator('.metric-value').all_text_contents()==['1,234','未取得','4,567'];assert not page.locator('.dashboard-details').evaluate('(e)=>e.open');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.screenshot(path=os.path.join(os.environ['DESIGN_CAPTURE_DIR'],'mobile-after.png'),full_page=True);page.set_viewport_size({'width':1280,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=os.path.join(os.environ['DESIGN_CAPTURE_DIR'],'desktop-after.png'),full_page=True);page.set_viewport_size({'width':390,'height':844})
  with page.expect_download() as saved:page.get_by_role('button',name='運営サマリーを保存（Markdown）',exact=True).click()
  downloaded=saved.value;assert downloaded.suggested_filename.startswith('unity-operations-');assert 'Unity運営サマリー' in open(downloaded.path()).read();assert 'モデルの文章はこの書き出しには含めていません' in open(downloaded.path()).read()
  page.get_by_text('比較・AI提案・実行履歴の詳細',exact=True).click()
  page.get_by_role('heading',name='自動運転の実行診断',exact=True).wait_for();page.get_by_role('heading',name='自動監視',exact=True).wait_for();page.get_by_text('初回の定期実行待ち',exact=True).wait_for()
  current['lastRun']={'day':'2026-10-22','startedAt':'2026-10-21T22:40:00.000Z','finishedAt':'2026-10-21T22:40:01.000Z','status':'success','created':1}
  current['health']={'level':'recorded','issues':[]}
  page.get_by_role('button',name='状態を再取得',exact=True).click();page.get_by_text('取得・判定成功',exact=False).wait_for();page.get_by_text('予約合計: 3 → 5（差分 +2）',exact=True).wait_for();page.get_by_text('実参加合計: 比較不可',exact=False).wait_for();page.get_by_role('heading',name='告知状況を確認',exact=True).wait_for();page.get_by_text('個別イベントは未特定',exact=False).wait_for();current['health']={'level':'attention','issues':[{'code':'ai_failed','severity':'attention','message':'前回のAI生成が失敗しました。','check':'無料枠と接続設定を確認。有料fallbackはありません。'}]};page.get_by_role('button',name='状態を再取得',exact=True).click();page.get_by_role('heading',name='前回のAI生成が失敗しました。',exact=True).wait_for();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors;b.close()
 print('PASS: 390px daily and AI UI initial pending and unverified proposal, no JS errors or overflow (mocked state display)')
finally:p.terminate();p.wait();shutil.rmtree(root)
