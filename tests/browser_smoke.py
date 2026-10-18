"""Local-only real-browser smoke. Requires Python playwright and Chromium."""
import json,os,secrets,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
token=secrets.token_urlsafe(40)
with tempfile.TemporaryDirectory(prefix='unity-agents-ui-') as runtime:
 env={**os.environ,'UNITY_SMOKE_TOKEN':token,'UNITY_SMOKE_DIR':runtime}
 script="""import {createApp} from './dist/server.js';import {FileStore} from './dist/store.js';const s=createApp({store:new FileStore(process.env.UNITY_SMOKE_DIR),adminToken:process.env.UNITY_SMOKE_TOKEN});s.listen(0,'127.0.0.1',()=>console.log(s.address().port));"""
 process=subprocess.Popen(['node','--input-type=module','-e',script],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  port=process.stdout.readline().strip();assert port.isdigit(),'server did not start'
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto('http://127.0.0.1:'+port)
   page.get_by_label('管理者トークン').fill(token);page.get_by_role('button',name='ログイン',exact=True).click()
   page.get_by_role('button',name='タスク',exact=True).wait_for();page.get_by_role('button',name='タスク',exact=True).click()
   page.get_by_label('依頼内容').fill('このシステムの稼働状態を確認');page.get_by_role('button',name='指示を登録').click();page.get_by_role('heading',name='このシステムの稼働状態を確認',exact=True).wait_for()
   page.get_by_role('button',name='ダッシュボード',exact=True).click()
   for _ in range(2):
    with page.expect_response(lambda r:r.url.endswith('/api/state')):page.get_by_role('button',name='キューを1工程進める').click()
   page.get_by_role('button',name='タスク',exact=True).click();assert page.get_by_text('完了',exact=True).is_visible()
   page.get_by_label('依頼内容').fill('次のイベントの集客改善案を議論して');page.get_by_role('button',name='指示を登録').click();page.get_by_role('heading',name='次のイベントの集客改善案を議論して',exact=True).wait_for();page.get_by_role('button',name='ダッシュボード',exact=True).click()
   with page.expect_response(lambda r:r.url.endswith('/api/state')):page.get_by_role('button',name='キューを1工程進める').click()
   page.get_by_role('button',name='タスク',exact=True).click();page.get_by_text('ChatGPT / Codexへの引継ぎプロンプト',exact=True).click();assert page.get_by_text('ChatGPT / Codex引継ぎ待ち',exact=True).is_visible()
   page.get_by_label('人が確認した結果JSON').fill(json.dumps({'summary':'人が確認したテスト結果','evidence':['ローカル検証'],'objections':[],'unverified':['実データ未接続']},ensure_ascii=False))
   with page.expect_response(lambda r:r.url.endswith('/api/state')):page.get_by_role('button',name='結果を取り込む（内容は未検証として扱う）').click()
   page.get_by_label('依頼内容').fill('本番へデプロイ');page.get_by_role('button',name='指示を登録').click();page.get_by_role('heading',name='本番へデプロイ',exact=True).wait_for();page.get_by_role('button',name='承認待ち',exact=True).click()
   page.once('dialog',lambda dialog:dialog.accept())
   with page.expect_response(lambda r:r.url.endswith('/api/state')):page.get_by_role('button',name='承認を記録（実操作は未対応）').click()
   assert page.get_by_text('承認記録の期限:',exact=False).is_visible()
   for tab in ['エージェント','実行履歴','連携状況','監査ログ','設定','ダッシュボード']:
    page.get_by_role('button',name=tab,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'mobile overflow: '+tab
   page.once('dialog',lambda dialog:dialog.accept())
   with page.expect_response(lambda r:r.url.endswith('/api/state')):page.get_by_role('button',name='緊急停止',exact=True).click()
   assert page.get_by_text('緊急停止中',exact=True).is_visible()
   out=root/'.runtime';out.mkdir(exist_ok=True);page.screenshot(path=str(out/'mobile-smoke.png'),full_page=True)
   page.set_viewport_size({'width':1280,'height':900});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth');page.screenshot(path=str(out/'desktop-smoke.png'),full_page=True)
   page.get_by_role('button',name='ログアウト',exact=True).click();page.get_by_role('heading',name='管理者ログイン',exact=True).wait_for();assert not errors,errors
   browser.close();print('PASS browser: login, local execution, handoff, approval record, emergency stop, logout, 390/1280px, no JS errors')
 finally:
  process.terminate();process.wait(timeout=10)
