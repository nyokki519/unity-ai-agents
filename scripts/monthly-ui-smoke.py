# Run from repository root after npm run build. Requires Python Playwright and Chromium.
import subprocess,tempfile,secrets,time,urllib.request,shutil,os
from playwright.sync_api import sync_playwright
root=tempfile.mkdtemp(prefix='unity-result-');token=secrets.token_urlsafe(40)
script="import {createApp} from './dist/server.js';import {FileStore} from './dist/store.js';import {OperationDay} from './dist/operations-history-model.js';const store=new FileStore(process.argv[1]);await store.transaction(s=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),month=today.slice(0,7),old=new Date(month+'-01T00:00:00Z');old.setUTCDate(0);for(const m of [old.toISOString().slice(0,7),month]){const day=m+'-01',at=day+'T00:00:00.000Z',metric={value:0,knownEvents:1,totalEvents:1};s.operationsHistory.push(OperationDay.parse({day,startedAt:at,finishedAt:at,recordedAt:at,status:'success',created:2,fetchedAt:at,snapshot:{observedAt:at,sourceUpdatedAt:at,period:{start:at,end:at},syncStatus:'complete',events:1,pastEvents:0,upcomingEvents:1,bookings:metric,attendance:{value:null,knownEvents:0,totalEvents:0},pageviews:{value:10,knownEvents:1,totalEvents:1},revenue:null,repeatRate:null,satisfaction:null},aiStatus:'succeeded',aiReason:null}));}});createApp({store,adminToken:process.argv[2]}).listen(8792,'127.0.0.1');"
p=subprocess.Popen(['node','--input-type=module','-e',script,root,token],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(50):
  try:urllib.request.urlopen('http://127.0.0.1:8792/api/health');break
  except Exception:time.sleep(.1)
 with sync_playwright() as pw:
  b=pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page.set_default_timeout(4000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8792');page.locator('#token').fill(token);page.locator('#login-form button').click();page.locator('.monthly-overview>summary').click();page.get_by_label('対象の月',exact=True).wait_for()
  data=page.evaluate("fetch('/api/state').then(r=>r.json())");m=data['monthlyOperations'];previous=next(r['month'] for r in m['reports'] if r['month']!=m['currentMonth']);page.get_by_label('対象の月',exact=True).select_option(previous);page.get_by_text('直近の保存値 · 期間合計ではありません',exact=True).wait_for();page.get_by_text('予約合計: 0',exact=False).wait_for();assert page.locator('.monthly-overview').evaluate('(e)=>e.open')
  page.screenshot(path='/tmp/unity-monthly-mobile.png',full_page=True)
  with page.expect_download() as saved:page.get_by_role('button',name='月次レポートを保存（Markdown）',exact=True).click()
  d=saved.value;assert d.suggested_filename=='unity-operations-month-'+previous+'.md';text=open(d.path()).read();assert '期間合計ではありません' in text;assert '予約合計: 0' in text;assert '未記録' in text;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors;b.close()
 print('PASS: 390px monthly selector/open state/0 vs missing/Markdown export/no overflow or JS errors (local fixtures)')
finally:p.terminate();p.wait();shutil.rmtree(root)
