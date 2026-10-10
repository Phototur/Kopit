"""Cloud adapter browser integration with mocked Supabase HTTP (not the live project)."""
import json, socket, subprocess, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
with socket.socket() as s:
 s.bind(('127.0.0.1',0));port=s.getsockname()[1]
base=f'http://127.0.0.1:{port}/docs/app/'
proc=subprocess.Popen(['python3','-m','http.server',str(port),'--bind','127.0.0.1'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for _ in range(100):
  try: urllib.request.urlopen(base).close();break
  except OSError: time.sleep(.05)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  db={};revision=[0];stale=[False]
  def route(r):
   path=r.request.url.split('.supabase.co')[1];payload=r.request.post_data_json or {}
   data={};status=200
   if '/token?' in path: data={'access_token':'test-access','refresh_token':'test-refresh','expires_in':3600}
   elif path.startswith('/auth/v1/user'): data={'email':'test@example.com'}
   elif path=='/rest/v1/rpc/kopit_load': data={'state':db['state'],'revision':revision[0]}
   elif path=='/rest/v1/rpc/kopit_save':
    if stale[0] or payload['p_revision']!=revision[0]: status=409;data={'code':'K4090','message':'stale'};stale[0]=False
    else: db['state']=payload['p_state'];revision[0]+=1;data={'state':db['state'],'revision':revision[0]}
   r.fulfill(status=status,content_type='application/json',body=json.dumps(data))
  context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
  context.route('https://*.supabase.co/**',route)
  page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base)
  expect(page.get_by_role('button',name='Войти',exact=True)).to_be_visible()
  page.evaluate("""()=>{
   const day=dateKey();let s=KopitFinance.initial(day);const act=p=>s=KopitFinance.apply(s,p,day);
   act({action:'income',amount:37500000});act({action:'category',name:'Машина',limit:2000000,icon:'car'});
   const id=s.categories[0].id;act({action:'daily_expenses',entries:[{category:id,amount:50000,tags:['Парковка']},{category:id,amount:100000,tags:[]}],date:day});
   if(s.balance!==17350000||s.transactions.length!==3||!s.checked_days.includes(day))throw Error('Daily batch failed');
   const before=JSON.stringify(s);try{KopitFinance.apply(s,{action:'daily_expenses',entries:[{category:id,amount:100,tags:[]},{category:'missing',amount:100,tags:[]}]},day);}catch{}
   if(JSON.stringify(s)!==before)throw Error('Failed batch mutated source');
   act({action:'allocate',allocations:{[s.goals[0].id]:2500000}});act({action:'goal_expense',id:s.goals[0].id,amount:100000});
   if(s.balance!==17350000||s.free!==0||s.goals[0].saved!==2400000)throw Error('Goal balance failed');
   const next=KopitFinance.rollover(s,'2026-11-01').state;if(next.balance!==17500000||next.reserve!==17350000)throw Error('Rollover failed');
  }""")
  db['state']=page.evaluate('KopitFinance.initial(dateKey())')
  page.get_by_label('Электронная почта').fill('test@example.com');page.get_by_label('Пароль',exact=True).fill('test-password')
  page.get_by_role('button',name='Войти',exact=True).click()
  expect(page.locator('.hero .big')).to_have_text('0 ₽')
  page.get_by_role('button',name='+ Добавить доход',exact=True).click();page.get_by_label('Сумма, ₽',exact=True).fill('375000');page.locator('#submit-modal').click()
  expect(page.locator('.hero .big')).to_have_text('175 000 ₽');assert db['state']['reserve']==17500000 and db['state']['free']==2500000
  page.reload();expect(page.locator('.hero .big')).to_have_text('175 000 ₽')
  # A separate device session reads the same remote state.
  phone=browser.new_context(viewport={'width':375,'height':812},is_mobile=True,has_touch=True);phone.route('https://*.supabase.co/**',route)
  second=phone.new_page();second.goto(base);second.get_by_label('Электронная почта').fill('test@example.com');second.get_by_label('Пароль',exact=True).fill('test-password');second.get_by_role('button',name='Войти',exact=True).click();expect(second.locator('.hero .big')).to_have_text('175 000 ₽')
  stale[0]=True;page.get_by_role('button',name='+ Добавить доход',exact=True).click();page.get_by_label('Сумма, ₽',exact=True).fill('2000');page.locator('#submit-modal').click();expect(page.locator('#modal-error')).to_contain_text('другом устройстве');assert db['state']['free']==2500000;page.locator('#close-modal').click()
  for width in [320,375,390,430]:
   page.set_viewport_size({'width':width,'height':844})
   for name in ['Обзор','Категории','Цели','История','Настройки','Инструкция']:
    page.get_by_role('button',name=name,exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,name)
  page.get_by_role('button',name='Обзор',exact=True).click();page.screenshot(path='/tmp/kopit-cloud-iphone.png',full_page=True)
  # Recovery callback tokens must be consumed and removed even with app's history() function.
  recovery=browser.new_context();recovery.route('https://*.supabase.co/**',route);rp=recovery.new_page();rp.goto(base+'#access_token=test-access&refresh_token=test-refresh&type=recovery&expires_in=3600');expect(rp.get_by_role('heading',name='Новый пароль')).to_be_visible();assert rp.evaluate('location.hash')=='';rp.get_by_label('Пароль',exact=True).fill('new-password');rp.get_by_role('button',name='Сохранить пароль').click();expect(rp.locator('.hero .big')).to_have_text('175 000 ₽')
  assert not errors,errors
  browser.close();print('Cloud HTTP mock passed: login, remote save, reload, second device, revision conflict, recovery callback, six screens at 320/375/390/430px.')
finally:
 proc.terminate();proc.wait(timeout=5)
