const $ = (q, root=document) => root.querySelector(q);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rub = n => new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n/100)+' ₽';
const money = n => {
  const raw=String(n ?? '').trim().replace(/[\s\u00a0\u202f]/g,'').replace(/₽$/,'');
  if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw))throw Error('Введите сумму, например 2 000 или 2 000,50.');
  const v=Number(raw.replace(',','.'));
  if(!Number.isFinite(v)||!Number.isSafeInteger(Math.round(v*100)))throw Error('Укажите корректную сумму.');
  return Math.round(v*100);
};
let state, revision, email, page='home', authMode='login';
const app=$('#app'), modal=$('#modal');
const dateNow=()=>new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Moscow'}));
const dateKey=()=>{const d=dateNow();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
async function api(path,data){if(window.KOPIT_SUPABASE){try{return await cloudApi(path,data);}catch(e){if(e.status===409)await load(false);if(e.status===401&&path==='action')auth();throw e;}}if(window.KOPIT_DEMO)return demoApi(path,data);const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});let body;try{body=await response.json();}catch{throw Error('Сервер недоступен. Проверьте подключение.');}if(!response.ok){if(response.status===409)await load(false);if(response.status===401&&path==='action')auth();throw Error(body.error||'Не удалось выполнить действие.');}return body;}
function accept(data){state=data.state;revision=data.revision;email=data.email;}
async function load(renderPage=true){try{accept(await api('state'));if(renderPage)render();if(!window.KOPIT_DEMO)$('#logout').classList.remove('hidden');}catch(e){if(e.code==='recovery_required'){authMode='password';auth();}else if(e.status===401||(!window.KOPIT_SUPABASE&&!state))auth();else if(!state){app.innerHTML=`<section class="auth"><h1>Подключение</h1><p role="alert">${esc(e.message)}</p><button id="retry" class="primary">Повторить</button></section>`;$('#retry').onclick=()=>load();}else toast(e.message);}}
async function action(type,data){const result=await api('action',{...data,action:type,revision});accept(result);render();}
function toast(message){$('#toast').textContent=message;$('#toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.add('hidden'),4500);}
function auth(){
 setupDraft=null;setupBack=[];state=null;$('#logout').classList.add('hidden');
 const recovery=authMode==='recover',password=authMode==='password',register=authMode==='register';
 app.innerHTML=`<section class="auth"><div class="eyebrow">Копить / личный учёт</div><h1>${password?'Новый пароль':recovery?'Восстановить доступ':register?'Создать аккаунт':'Войти в Копить'}</h1><p class="muted">Месячный бюджет, резерв и накопления. Ваши записи доступны с разных устройств после входа.</p><form id="auth-form">${password?'':'<label for="email">Электронная почта</label><input id="email" type="email" autocomplete="email" required maxlength="254">'}${recovery?'':`<label for="password">Пароль</label><input id="password" type="password" autocomplete="${register||password?'new-password':'current-password'}" minlength="8" maxlength="200" required>`}<p id="form-error" role="alert"></p><button class="primary">${password?'Сохранить пароль':recovery?'Отправить ссылку':register?'Создать аккаунт':'Войти'}</button></form><button id="auth-toggle" class="quiet">${register||recovery||password?'Вернуться ко входу':'Первый раз здесь? Создать аккаунт'}</button>${window.KOPIT_SUPABASE&&!recovery&&!password?'<button id="recover" class="quiet">Забыли пароль?</button>':''}<div class="note">Начальный бюджет — 175 000 ₽. Его можно изменить в настройках.</div></section>`;
 $('#auth-toggle').onclick=()=>{authMode=register||recovery||password?'login':'register';auth();};if($('#recover'))$('#recover').onclick=()=>{authMode='recover';auth();};
 $('#auth-form').onsubmit=async e=>{e.preventDefault();const b=$('button.primary');b.disabled=true;try{const result=await api(authMode,{email:$('#email')?.value,password:$('#password')?.value});if(result.confirmation_required||recovery){$('#form-error').textContent=result.confirmation_required?'Откройте письмо и подтвердите почту. После этого войдите.':'Если аккаунт существует, на почту придёт ссылка для восстановления.';b.disabled=false;return;}authMode='login';await load();}catch(err){$('#form-error').textContent=err.message;b.disabled=false;}};
}
function progress(value,total){return `<div class="progress"><progress max="${Math.max(1,total)}" value="${Math.max(0,Math.min(value,total))}" aria-label="Накоплено ${esc(rub(value))} из ${esc(rub(total))}"></progress></div>`;}
const monthSpent=()=>((state.opening?.month===state.month?state.opening.spent:0)||0)+state.transactions.filter(t=>t.kind==='expense'&&t.date.startsWith(state.month)).reduce((a,t)=>a+t.amount,0);
const iconPaths={
 home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-8h6v8"/>',
 categories:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7m-3.5-3.5v7"/>',
 goals:'<path d="M5 22V3m0 1h13l-3 5 3 5H5"/><circle cx="11" cy="8.5" r="1"/>',
 history:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3M3 4v5h5"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
 tutorial:'<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/><path d="M6 8h3m-3 4h3m6-4h3m-3 4h3"/>',
 coffee:'<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Zm13 1h2a3 3 0 0 1 0 6h-2M3 22h16M7 3v3m4-4v4m4-3v3"/>',
 car:'<path d="m4 9 2-5h12l2 5M3 9h18v9H3V9Zm2 9v3m14-3v3"/><circle cx="7" cy="13" r="1"/><circle cx="17" cy="13" r="1"/><path d="M10 14h4"/>',
 heart:'<path d="M12 21 3 12C-2 5 7 0 12 7 17 0 26 5 21 12Z"/>',
 star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
 sun:'<circle cx="12" cy="12" r="5"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
 plane:'<path d="m3 11 8-2 4-7 3 1-2 6 6 3-1 2-6-1-2 6 2 2-1 1-4-2-2-4-5-3Z"/>',
 laptop:'<rect x="4" y="3" width="16" height="13" rx="1"/><path d="M4 16 1 21h22l-3-5M9 10l2 2 4-5"/>',
 reserve:'<path d="M4 7h16v14H4V7Zm2 0V4h12v3M4 11h16"/><circle cx="12" cy="16" r="2"/>',
 leaf:'<path d="M5 19C-2 7 12 3 21 3c0 12-5 21-16 16Zm0 0 10-9M5 19l-2 3"/>'
};
Object.assign(iconPaths,{
 groceries:'<path d="M4 9h16l-2 12H6L4 9Zm3 0 3-6m7 6-3-6M9 13v4m6-4v4"/>',
 restaurant:'<path d="M5 2v7m3-7v7M3 2v5c0 3 7 3 7 0V2M6.5 10v12M19 2c-4 3-4 9 0 10V2Zm0 10v10"/>',
 water:'<path d="M12 2C9 7 4 12 4 16a8 8 0 0 0 16 0c0-4-5-9-8-14ZM8 15c0 3 1 4 4 4"/>',
 book:'<path d="M5 3h14v18H5a3 3 0 0 1 0-6h14M5 3a3 3 0 0 0-3 3v12M8 7h7m-7 4h4"/>',
 education:'<path d="m2 8 10-5 10 5-10 5L2 8Zm4 3v6c4 3 8 3 12 0v-6M22 8v9"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4m-3 14h2"/>',
 wifi:'<path d="M2 8c6-5 14-5 20 0M5 12c4-4 10-4 14 0M8 16c2-2 6-2 8 0"/><circle cx="12" cy="20" r="1"/>',
 game:'<path d="M7 7h10c4 0 6 10 4 12s-5-3-7-3h-4c-2 0-5 5-7 3S3 7 7 7Z"/><path d="M6 10v5m-2.5-2.5h5M16 11h.1M19 14h.1"/>',
 music:'<path d="M9 18V5l11-3v14M9 8l11-3"/><ellipse cx="6" cy="19" rx="3" ry="2"/><ellipse cx="17" cy="17" rx="3" ry="2"/>',
 camera:'<path d="M3 7h4l2-3h6l2 3h4v14H3V7Z"/><circle cx="12" cy="14" r="4"/>',
 paint:'<path d="m14 3 7 7-11 9-5-5L14 3Zm-9 11-3 8 8-3M11 6l7 7"/>',
 sport:'<path d="M2 8v8m3-10v12m3-8h8m0-4v12m3-10v8m3-6v4"/>',
 bike:'<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 5-9 5 9H5Zm5-9h7l2 9M8 5h4m3-1h3v4"/>',
 walk:'<circle cx="14" cy="3.5" r="2"/><path d="m9 10 4-4 4 4 4 1m-8-5-3 8 5 3 1 5m-6-8-4 7m4-11H5"/>',
 medical:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4m-4 4v6m-3-3h6"/>',
 pet:'<ellipse cx="12" cy="17" rx="5" ry="4"/><ellipse cx="4" cy="10" rx="2" ry="3"/><ellipse cx="9" cy="6" rx="2" ry="3"/><ellipse cx="15" cy="6" rx="2" ry="3"/><ellipse cx="20" cy="10" rx="2" ry="3"/>',
 gift:'<path d="M3 8h18v5H3V8Zm2 5v9h14v-9M12 8v14"/><path d="M12 8C2 8 5-2 12 8c7-10 10 0 0 0Z"/>',
 clothes:'<path d="m8 3 4 2 4-2 6 5-4 4-2-2v12H8V10l-2 2-4-4 6-5Z"/>',
 shoe:'<path d="M3 6h5l3 8 10 3v4H3V6ZM3 17h18m-9-7 3 1m-2 2 3 1"/>',
 tools:'<path d="M15 2a6 6 0 0 0-7 8L2 17l5 5 7-8a6 6 0 0 0 8-7l-5 4-4-4 2-5Z"/>',
 train:'<rect x="5" y="2" width="14" height="17" rx="3"/><path d="M5 11h14M12 3v8M8 19l-3 3m11-3 3 3M8 15h.1m8 0h.1"/>',
 bus:'<rect x="4" y="3" width="16" height="17" rx="2"/><path d="M4 12h16M7 20v2m10-2v2M7 16h.1m10 0h.1M8 6h8"/>',
 boat:'<path d="M12 2v14M12 3l8 10h-8m-2-8L4 13h6M2 16h20l-4 5H6l-4-5Z"/>',
 bank:'<path d="m2 7 10-5 10 5H2Zm3 3v8m5-8v8m4-8v8m5-8v8M2 22h20M3 19h18"/>',
 wallet:'<path d="M20 7V3L3 6v15h18V7H3M16 11h6v6h-6v-6Z"/><path d="M18 14h.1"/>',
 coin:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="7"/><path d="M10 17V7h4a3 3 0 0 1 0 6h-6m0 2h6"/>',
 chart:'<path d="M3 3v18h19M6 16l5-6 4 3 6-8m-5 0h5v5"/>',
 calendar:'<rect x="3" y="5" width="18" height="17" rx="1"/><path d="M7 2v6m10-6v6M3 11h18m-14 4h3m4 0h3m-10 4h3"/>',
 moon:'<path d="M20 15A9 9 0 0 1 9 3a10 10 0 1 0 11 12Z"/>',
 umbrella:'<path d="M2 11a10 10 0 0 1 20 0H2Zm10-9v17c0 4 5 4 5 0"/>'
});
const categoryIconLabels={home:'Дом',coffee:'Чашка',car:'Машина',heart:'Сердце',star:'Звезда',sun:'Солнце',plane:'Самолёт',laptop:'Ноутбук',reserve:'Запас',leaf:'Росток',groceries:'Продукты',restaurant:'Ресторан',water:'Вода',book:'Книга',education:'Обучение',phone:'Телефон',wifi:'Интернет',game:'Игры',music:'Музыка',camera:'Фото',paint:'Творчество',sport:'Спорт',bike:'Велосипед',walk:'Прогулка',medical:'Медицина',pet:'Питомец',gift:'Подарок',clothes:'Одежда',shoe:'Обувь',tools:'Ремонт',train:'Поезд',bus:'Автобус',boat:'Лодка',bank:'Банк',wallet:'Кошелёк',coin:'Монета',chart:'Рост',calendar:'Календарь',moon:'Сон',umbrella:'Зонт'};

function pictogram(name,extra=''){return `<svg class="pictogram ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]||iconPaths.star}</svg>`;}
function itemIcon(item){if(item?.icon)return item.icon;const name=(item?.name||'').toLowerCase();if(/запас|резерв/.test(name))return 'reserve';if(/жиль|дом|аренд/.test(name))return 'home';if(/еда|кафе|продукт/.test(name))return 'coffee';if(/машин|авто/.test(name))return 'car';if(/отпуск|путеш/.test(name))return 'plane';if(/ноут|техник/.test(name))return 'laptop';if(/здоров|себя/.test(name))return 'heart';return 'star';}
function iconPicker(item){const chosen=itemIcon(item);return `<fieldset class="icon-picker"><legend>Выберите пиктограмму</legend><input id="icon-choice" type="hidden" value="${chosen}"><div class="icon-grid">${Object.entries(categoryIconLabels).map(([id,name])=>`<button type="button" data-icon-choice="${id}" aria-label="${name}" title="${name}" aria-pressed="${chosen===id}" class="${chosen===id?'selected':''}">${pictogram(id)}</button>`).join('')}</div></fieldset>`;}
function littleHuman(){return `<svg class="little-human" viewBox="0 0 240 180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="124" cy="38" r="18" fill="#f1e76b"/><path d="M110 29c5-13 25-12 31 2M117 39h1m13 0h1m-12 6c4 4 8 4 12 0M110 56l-12 12-5 33 32 12 29-12-8-33-13-12M101 69 70 91 47 75m99-6 27 24 21-21M110 107l-31 27c-13 8-15 18 5 20l42-16 37 17c17 0 18-12 4-20l-28-29M46 74l-4-9m4 9 8-7m141 4 3-10m-3 10-8-6M118 70v17h12V70M32 156h172"/><circle cx="42" cy="47" r="19"/><path d="M36 47h12m-6-6v12M186 34h26v25h-26zM190 29h18M189 44h20M196 49h6m-14 61 4-7 4 7 8 1-6 5 2 8-8-4-7 4 1-8-6-5 8-1"/></svg>`;}
function tutorial(){
  const steps=[
    {n:'00',title:'Пройдите начальную настройку.',text:'При первом входе приложение задаёт вопросы по одному: месячный бюджет, общая доступная сумма без уже отложенных целей, остаток на текущий месяц, уже потраченное и резерв на следующий месяц. Затем укажите накопления на второй месяц запаса, добавьте свои цели и категории. Лимиты категорий необязательны. На последнем экране проверьте суммы и нажмите «Сохранить и начать». Все ответы сохраняются вместе; до подтверждения это только черновик. Стартовые остатки не записываются в историю как доходы или расходы.',image:'tutorial-setup.png',alt:'Пошаговая начальная настройка с вопросом о бюджете на месяц',caption:'Первый вход → начальные данные',button:'Открыть настройки',page:'settings'},
    {n:'01',title:'Задайте бюджет на месяц.',text:'Бюджет задаётся в начальном опроснике. Позже его можно изменить в настройках. Например, 175 000 ₽. Приложение предназначено для фрилансеров с нерегулярными поступлениями: месячный бюджет задаётся отдельно от фактического дохода.',image:'tutorial-budget.png',alt:'Главный экран: остаток месячного бюджета и кнопки дохода и расхода',caption:'Обзор → ваш месячный бюджет',button:'Посмотреть бюджет',page:'settings'},
    {n:'02',title:'Записывайте доходы и расходы.',text:'Каждое поступление записывайте отдельной кнопкой «Добавить доход» на главной. Для расхода нажмите «На что потратил» в жёлтой карточке, выберите категорию и укажите сумму. Категории создаются самостоятельно; теги необязательны. Сумма лимитов категорий не может превышать месячный бюджет. Категория может быть без лимита.',image:'tutorial-categories.png',alt:'Экран категорий с лимитами и тегами',caption:'Категории → ваши правила расходов',button:'Открыть категории',page:'categories'},
    {n:'03',title:'Пополняйте резерв на следующий месяц.',text:'Поступления автоматически обеспечивают текущий месячный бюджет, затем резерв на следующий месяц. При бюджете 175 000 ₽ полный резерв — 175 000 ₽. В начале нового месяца неизрасходованный остаток переносится, а из резерва добавляется только недостающее до бюджета.',image:'tutorial-reserve.png',alt:'Карточка резерва на следующий месяц с индикатором наполнения',caption:'Резерв → следующий месяц обеспечен',button:'Вернуться в обзор',page:'home'},
    {n:'04',title:'Распределяйте свободную сумму по целям.',text:'После обеспечения текущего месяца и полного резерва остаток доступен для целей. Расставьте цели по приоритету и нажмите «Распределить». Например, 25 000 ₽ на три цели: 9 000 ₽ первой, по 8 000 ₽ остальным. Границы секторов меняют суммы с шагом 2 000 ₽. Поля суммы позволяют точный ввод. Подтвердите распределение кнопкой «Сохранить».',image:'tutorial-allocation.png',alt:'Цветная диаграмма распределения суммы по целям с полями точного ввода',caption:'Цели → распределение свободной суммы',button:'Открыть цели',page:'goals'},
    {n:'05',title:'Накопите дополнительный месяц резерва.',text:'Цель «Ещё один месяц запаса» вместе с основным резервом даёт запас на два месяца. Её можно поставить первой по приоритету. Для покупки из накоплений нажмите «Записать расход» внутри нужной цели. Уменьшится только сумма этой цели; бюджет месяца не изменится.',image:'tutorial-goals.png',alt:'Цели с накопленными суммами, приоритетами и кнопками записи расходов',caption:'Цели → накопления и расходы отдельно',button:'Посмотреть накопления',page:'goals'},
    {n:'06',title:'Заполняйте расходы за день.',text:'Нажмите «Заполнить день». Сегодня уже выбрано: категория → сумма → ещё расход? → итог. Теги добавляются по желанию. Все записи подтверждаются в конце. Если ничего не потратили, отметьте день без расходов.',image:'tutorial-daily.png',alt:'Пошаговый экран с вводом суммы ежедневного расхода',caption:'Заполнить день → одно действие за раз',button:'Попробовать сейчас',flow:true}
  ];
  $('#content').innerHTML=`<section class="tutorial-intro"><div><span class="eyebrow">Инструкция / для фрилансеров</span><h1>Как пользоваться<br>«Копить».</h1><p>Учёт расходов и накоплений для фрилансеров.<br>Месячный бюджет, резерв и цели — от первого входа до ежедневных записей.</p><a class="tutorial-anchor" href="#guide-00">Перейти к инструкции ↓</a></div>${littleHuman()}</section><div class="tutorial-steps">${steps.map(s=>`<article id="guide-${s.n}" class="tutorial-step"><div class="tutorial-text"><span class="eyebrow">${Number(s.n)+1} / 07</span><h2>${s.title}</h2><p>${s.text}</p><button class="primary" ${s.flow?'data-guide-flow':`data-guide-page="${s.page}"`}>${s.button} →</button></div><figure><img src="${s.image.startsWith('data:')?s.image:'./'+s.image}" alt="${s.alt}" loading="lazy"><figcaption>${s.caption}</figcaption></figure></article>`).join('')}</div><div class="note tutorial-note">${window.KOPIT_DEMO?'В демоверсии изменения исчезают после перезагрузки.':'Записи сохраняются в аккаунте после подтверждения действия. Иллюстрации показывают пример заполненного бюджета.'} Напоминания работают при открытом приложении и разрешении браузера.</div>`;
  app.querySelectorAll('[data-guide-page]').forEach(b=>b.onclick=()=>{page=b.dataset.guidePage;render();window.scrollTo(0,0);});
  $('[data-guide-flow]').onclick=dailyFlow;
}

function render(){
  if(!state)return;
  if(needsSetup()){if(!setupDraft)startSetup();else drawSetup();return;}
  const labels={home:'Обзор',categories:'Категории',goals:'Цели',history:'История',settings:'Настройки',tutorial:'Инструкция'};
  app.innerHTML=`${window.KOPIT_DEMO?'<div class="note reminder">Деморежим · можно нажимать всё. Изменения исчезнут после перезагрузки.</div>':''}<nav class="bottom-nav ${state.appearance?.icons_only?'icons-only':''}" aria-label="Основное меню">${Object.entries(labels).map(([id,name])=>`<button data-page="${id}" aria-label="${name}" title="${name}" ${page===id?'aria-current="page"':''} class="${page===id?'active':''}">${pictogram(id)}<span class="nav-label">${name}</span></button>`).join('')}</nav><div id="content"></div>`;
  app.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render();window.scrollTo(0,0);});
  ({home,categories,goals,history:transactionHistory,settings,tutorial})[page]();remind();
}
function home(){const d=dateNow(),days=new Date(d.getFullYear(),d.getMonth()+1,0).getDate()-d.getDate()+1,weekDays=Math.min(days,8-(d.getDay()||7)),weekly=Math.round(Math.max(0,state.balance)/days*weekDays);const month=d.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});$('#content').innerHTML=`<div class="topline"><h1>Всё под контролем.</h1><span class="pill">${esc(month)}</span></div><button class="guide-shortcut quiet" id="guide-shortcut">${pictogram('tutorial')} Первый раз здесь? Как устроено «Копить» →</button><div class="dashboard"><div><section class="card hero"><div><div class="eyebrow">Осталось на месяц</div><div class="big ${state.balance<0?'danger':''}">${esc(rub(state.balance))}</div><p class="muted">Бюджет ${rub(state.budget)} · потрачено ${rub(monthSpent())}</p></div><div class="actions expense-only"><button class="primary" id="add-expense">На что потратил</button></div></section><section class="income-entry"><div><span class="eyebrow">Поступление от клиента</span><p>Бюджет месяца → резерв → цели</p></div><button id="add-income">+ Добавить доход</button></section><section class="daily-invite"><div><span class="eyebrow">Пара минут для себя</span><h2>Как прошёл день?</h2><p>Расходы за сегодня. По одному шагу.</p></div><button id="daily-start" class="primary">Заполнить день →</button></section><section class="card metrics"><div class="metric"><span class="muted">До конца недели</span><strong>${rub(weekly)}</strong><span class="muted">${weekDays} дн. · до воскресенья</span></div><div class="metric"><span class="muted">Ориентир на день</span><strong>${rub(Math.round(Math.max(0,state.balance)/days))}</strong><span class="muted">${days} дн. до конца месяца</span></div></section><section class="card"><div class="section-title"><h2>Последние записи</h2><button class="quiet" id="all-history">Все →</button></div>${transactions(state.transactions.slice(-4).reverse())}</section></div><div><section class="card"><div class="eyebrow">Спокойствие на следующий месяц</div><div class="number">${rub(state.reserve)}</div>${progress(state.reserve,state.budget)}<p class="muted">Нужно ${rub(state.budget)} · ${Math.min(100,Math.round(state.reserve/state.budget*100))}% обеспечено</p><div class="note">${state.reserve>=state.budget?'Следующий месяц обеспечен. Свободные деньги можно распределять по целям.':'Доход сначала обеспечивает текущий месяц, затем пополняет этот резерв.'}</div></section><section class="card"><div class="section-title"><h2>На ваши цели</h2></div><div class="number">${rub(state.free)}</div><p class="muted">Доступно для распределения</p><button id="allocate" class="primary" ${canAllocate()?'':'disabled'}>Распределить →</button></section><section class="card"><div class="section-title"><h2>Накоплено</h2><button class="quiet" id="all-goals">Цели →</button></div><div class="number">${rub(state.goals.reduce((a,g)=>a+g.saved,0))}</div><p class="muted">${state.goals.length} ${state.goals.length===1?'цель':'целей'} · в вашем порядке приоритетов</p></section></div></div>`;$('#guide-shortcut').onclick=()=>{page='tutorial';render();window.scrollTo(0,0);};$('#daily-start').onclick=dailyFlow;$('#add-expense').onclick=expense;$('#add-income').onclick=income;$('#allocate').onclick=allocate;$('#all-history').onclick=()=>{page='history';render();};$('#all-goals').onclick=()=>{page='goals';render();};}
function transactions(list){return list.length?list.map(t=>`<div class="row"><div><strong>${esc(t.kind==='income'?'Доход':t.kind==='expense'?t.category_name:t.kind==='allocation'?'В цель: '+t.goal_name:'Из цели: '+t.goal_name)}</strong><small>${esc(new Date(t.date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'}))}</small>${t.tags?.length?`<div class="tags">${t.tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`:''}</div><span class="sum">${t.kind==='income'?'+':'−'}${rub(t.amount)}</span></div>`).join(''):'<div class="empty">Пока тихо.<br>Запишите первый доход или расход.</div>';}
function categories(){$('#content').innerHTML=`<div class="topline"><h1>Расходы по категориям</h1><button class="primary" id="new-category">+ Категория</button></div><p class="muted">Лимиты: ${rub(state.categories.reduce((a,c)=>a+(c.limit||0),0))} из ${rub(state.budget)}. Категория может быть без лимита.</p><div class="card">${state.categories.length?state.categories.map(c=>{const used=state.transactions.filter(t=>t.kind==='expense'&&t.category===c.id&&t.date.startsWith(state.month)).reduce((a,t)=>a+t.amount,0);return `<div class="row"><div><h3 class="item-heading">${pictogram(itemIcon(c))}${esc(c.name)}</h3><small>${c.limit===null?'Без лимита':used>c.limit?`Лимит превышен на ${rub(used-c.limit)}`:`Осталось ${rub(c.limit-used)} из ${rub(c.limit)}`}</small><div class="tags">${c.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div><div><span class="sum">${rub(used)}</span><button class="quiet" data-category="${c.id}">Изменить</button></div></div>`;}).join(''):'<div class="empty">Создайте свои категории: например, еда, жильё или машина.<br>Теги добавляются при записи расхода.</div>'}</div>`;$('#new-category').onclick=()=>categoryForm();app.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>categoryForm(state.categories.find(c=>c.id===b.dataset.category)));}
function goals(){$('#content').innerHTML=`<div class="topline"><h1>Ближе к своему</h1><button class="primary" id="new-goal">+ Цель</button></div><div class="card section-title"><div><span class="muted">Доступно для распределения</span><div class="number">${rub(state.free)}</div></div><button id="allocate" ${canAllocate()?'':'disabled'}>Распределить →</button></div><div class="goals">${state.goals.map((g,i)=>`<section class="card"><div class="goal-top"><span class="eyebrow">Приоритет ${i+1}</span><div><button class="quiet" data-up="${g.id}" aria-label="Повысить приоритет" ${i===0?'disabled':''}>↑</button><button class="quiet" data-down="${g.id}" aria-label="Понизить приоритет" ${i===state.goals.length-1?'disabled':''}>↓</button></div></div><h2 class="item-heading">${pictogram(itemIcon(g))}${esc(g.name)}</h2><div class="number">${rub(g.saved)}</div><p class="muted">из ${rub(g.target)}${g.saved>=g.target?' · Цель достигнута!':''}</p>${progress(g.saved,g.target)}<div class="goal-actions"><button data-goal-expense="${g.id}" ${g.saved?'':'disabled'}>Записать расход</button><button data-edit-goal="${g.id}">Изменить</button></div></section>`).join('')}</div>`;$('#new-goal').onclick=()=>goalForm();$('#allocate').onclick=allocate;app.querySelectorAll('[data-goal-expense]').forEach(b=>b.onclick=()=>goalExpense(state.goals.find(g=>g.id===b.dataset.goalExpense)));app.querySelectorAll('[data-edit-goal]').forEach(b=>b.onclick=()=>goalForm(state.goals.find(g=>g.id===b.dataset.editGoal)));for(const direction of ['up','down'])app.querySelectorAll(`[data-${direction}]`).forEach(b=>b.onclick=async()=>{const ids=state.goals.map(g=>g.id),i=ids.indexOf(b.dataset[direction]),j=i+(direction==='up'?-1:1);[ids[i],ids[j]]=[ids[j],ids[i]];try{await action('goal_order',{ids});}catch(e){toast(e.message);}});}
function transactionHistory(){
  const months=[...new Set([state.month,...state.transactions.map(t=>t.date.slice(0,7))])].sort().reverse();
  const filters=[['','Все','Все операции за выбранный месяц'],['income','Доходы','Поступления от клиентов'],['allocation','Накопления','Пополнения целей'],['expense','Расходы','Расходы из месячного бюджета'],['goal_expense','Цели','Расходы из накоплений на цели']];
  let kind='';
  $('#content').innerHTML=`<div class="topline"><h1>История</h1></div><div class="history-filters"><select id="history-month" aria-label="Месяц истории">${months.map(m=>`<option>${m}</option>`).join('')}</select></div><div class="history-tabs" role="tablist" aria-label="Виды операций">${filters.map(([id,name],i)=>`<button id="history-tab-${i}" type="button" role="tab" data-history-kind="${id}" aria-selected="${i===0}" aria-controls="history-list" tabindex="${i===0?0:-1}">${name}</button>`).join('')}</div><div class="history-summary"><p id="history-description"></p><strong id="history-total"></strong></div><div class="card" id="history-list" role="tabpanel" aria-labelledby="history-tab-0"></div>`;
  const update=()=>{
    const list=state.transactions.filter(t=>t.date.startsWith($('#history-month').value)&&(!kind||t.kind===kind)).reverse();
    $('#history-list').innerHTML=transactions(list);
    $('#history-description').textContent=filters.find(f=>f[0]===kind)[2];
    $('#history-total').textContent=kind?rub(list.reduce((a,t)=>a+t.amount,0)):`${list.length} записей`;
    app.querySelectorAll('[data-history-kind]').forEach((b,i)=>{const active=b.dataset.historyKind===kind;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active)$('#history-list').setAttribute('aria-labelledby',`history-tab-${i}`);});
  };
  const tabs=[...app.querySelectorAll('[data-history-kind]')];
  tabs.forEach((b,i)=>{
    b.onclick=()=>{kind=b.dataset.historyKind;update();};
    b.onkeydown=e=>{let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();tabs[next].click();tabs[next].focus();};
  });
  $('#history-month').onchange=update;update();
}
function settings(){$('#content').innerHTML=`<div class="settings"><h1>Ваши правила</h1><section class="card"><h2>Бюджет на месяц</h2><p class="muted">Изменение применяется к текущему месяцу. Прошлые операции сохраняются.</p><form id="budget-form"><label for="budget">Сумма, ₽</label><input id="budget" type="number" min="1" step="0.01" value="${state.budget/100}" required><div class="form-actions"><button class="primary">Сохранить бюджет</button></div></form></section><section class="card"><h2>Напоминания</h2><p class="muted">Уведомления работают, пока приложение открыто. Браузер может попросить разрешение. Также показываем напоминания внутри приложения.</p><form id="reminder-form"><label><input id="reminder-enabled" type="checkbox" ${state.reminders.enabled?'checked':''}>Включить напоминания</label><label for="reminder-time">Записывать расходы каждый день</label><input id="reminder-time" type="time" value="${esc(state.reminders.daily)}" required><label for="reminder-day">День месяца: проверить бюджет и распределить деньги</label><input id="reminder-day" type="number" min="1" max="28" value="${state.reminders.day}" required><div class="form-actions"><button class="primary">Сохранить</button></div></form></section><section class="card"><h2>Меню</h2><label><input id="icons-only" type="checkbox" ${state.appearance?.icons_only?'checked':''}>Только пиктограммы, без подписей</label><p class="muted">Подписи помогают освоиться. Можно оставить только значки, когда привыкнете.</p></section><section class="card"><h2>Аккаунт</h2><p>${esc(email)}</p><p class="muted">Валюта — рубли. Финансовый день — по московскому времени. ${window.KOPIT_DEMO?'Это демонстрация. Данные не сохраняются и не отправляются на сервер.':'Данные хранятся на сервере; входите в этот аккаунт с других устройств.'}</p><button id="export">Скачать свои данные</button></section></div>`;$('#budget-form').onsubmit=async e=>{e.preventDefault();try{await action('budget',{amount:money($('#budget').value)});toast('Бюджет сохранён');}catch(err){toast(err.message);}};$('#reminder-form').onsubmit=async e=>{e.preventDefault();const p={enabled:$('#reminder-enabled').checked,daily:$('#reminder-time').value,day:Number($('#reminder-day').value)};try{if(p.enabled&&'Notification'in window&&Notification.permission==='default')await Notification.requestPermission();await action('reminders',p);toast('Напоминания сохранены');}catch(err){toast(err.message);}};$('#icons-only').onchange=async()=>{try{await action('appearance',{icons_only:$('#icons-only').checked});}catch(err){toast(err.message);}};$('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`kopit-${dateKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};}
function open(title,html,submit){
  $('#modal-title').textContent=title;
  const error=$('#modal-error');error.textContent='';
  modal.append(error);
  $('#modal-body').innerHTML=`<form id="modal-form" novalidate>${html}<div id="modal-feedback"></div><div class="form-actions"><button type="button" id="cancel">Отмена</button><button type="submit" class="primary" id="submit-modal">Сохранить</button></div></form>`;
  $('#modal-feedback').append(error);
  const form=$('#modal-form'),button=$('#submit-modal');
  $('#cancel').onclick=()=>modal.close();
  form.addEventListener('click',e=>{const picked=e.target.closest('[data-icon-choice]');if(!picked)return;$('#icon-choice').value=picked.dataset.iconChoice;form.querySelectorAll('[data-icon-choice]').forEach(b=>{const selected=b===picked;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});});
  form.addEventListener('input' ,()=>{error.textContent='';});
  form.onsubmit=async e=>{
    e.preventDefault();if(button.disabled)return;
    const invalid=[...form.querySelectorAll('input,select')].find(input=>!input.validity.valid);
    if(invalid){error.textContent=invalid.validity.valueMissing?'Заполните обязательное поле.':'Проверьте введённое значение: '+invalid.validationMessage;invalid.focus();return;}
    button.disabled=true;
    try{await submit();modal.close();toast('Сохранено');}
    catch(err){error.textContent=err.message;button.disabled=false;error.scrollIntoView({block:'nearest'});}
  };
  modal.showModal();
}
const amountField=(value='')=>`<label for="amount">Сумма, ₽</label><input id="amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${value}" required autofocus>`;
function income(){open('Новый доход',amountField()+'<p class="muted">Обеспечим месяц, пополним резерв. Остальное оставим для целей.</p>',()=>action('income',{amount:money($('#amount').value)}));}
function expense(){if(!state.categories.length){open('Сначала создадим категорию','<p class="muted">Например, еда, жильё или машина. После этого можно записать расход.</p><label for="name">Название</label><input id="name" maxlength="60" required>',()=>action('category',{name:$('#name').value,limit:null}));return;}open('Записать расход',amountField()+`<label for="category">Категория</label><select id="category">${state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><label for="tags">Теги через запятую — по желанию</label><input id="tags" placeholder="Например, бензин, парковка" maxlength="600"><div id="tag-options" class="tags"></div>`,()=>action('expense',{amount:money($('#amount').value),category:$('#category').value,tags:$('#tags').value.split(',').map(x=>x.trim()).filter(Boolean)}));const update=()=>{const c=state.categories.find(c=>c.id===$('#category').value);$('#tag-options').innerHTML=c.tags.map(t=>`<button type="button" class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('');$('#tag-options').querySelectorAll('button').forEach(b=>b.onclick=()=>{const tags=$('#tags').value.split(',').map(t=>t.trim()).filter(Boolean);if(!tags.includes(b.dataset.tag))tags.push(b.dataset.tag);$('#tags').value=tags.join(', ');});};$('#category').onchange=()=>{$('#tags').value='';update();};update();}
function categoryForm(c){open(c?'Изменить категорию':'Новая категория',`<label for="name">Название</label><input id="name" maxlength="60" value="${esc(c?.name||'')}" required>${iconPicker(c)}<label for="limit">Месячный лимит, ₽ — необязательно</label><input id="limit" type="number" min="0" step="0.01" value="${c?.limit!=null?c.limit/100:''}" placeholder="Без лимита">`,()=>action('category',{id:c?.id,name:$('#name').value,icon:$('#icon-choice').value,limit:$('#limit').value===''?null:money($('#limit').value)}));}
function goalForm(g){open(g?'Изменить цель':'Новая цель',`<label for="name">Название</label><input id="name" maxlength="60" value="${esc(g?.name||'')}" required>${iconPicker(g)}<label for="target">Нужно накопить, ₽</label><input id="target" type="number" min="1" step="0.01" value="${g?g.target/100:''}" required>${g?'':'<label for="saved">Уже накоплено, ₽</label><input id="saved" type="number" min="0" step="0.01" value="0"><p class="muted">Укажите отдельные накопления, которые уже есть. Они не списываются из месячного бюджета.</p>'}`,()=>action('goal',{id:g?.id,name:$('#name').value,icon:$('#icon-choice').value,target:money($('#target').value),saved:g?undefined:money($('#saved').value)}));}
function goalExpense(g){
  open('Расход из цели',`<p>${esc(g.name)} · доступно ${rub(g.saved)}</p><label for="amount">Сумма, ₽</label><input id="amount" type="text" inputmode="decimal" autocomplete="off" maxlength="32" placeholder="Например, 2 000,50" required autofocus>`,()=>{
    const value=money($('#amount').value);
    if(value<=0)throw Error('Сумма расхода должна быть больше нуля.');
    const available=state.goals.find(goal=>goal.id===g.id)?.saved||0;
    if(value>available)throw Error(`В этой цели доступно ${rub(available)}. Уменьшите сумму расхода.`);
    return action('goal_expense',{id:g.id,amount:value});
  });
}
function canAllocate(){return state.free>0&&state.reserve>=state.budget&&state.balance+monthSpent()>=state.budget;}
function allocate(){
  const colors=['#b9d8bd','#c8b8e0','#f1b7a6','#efd58c','#b4d7e4','#dcc7b4'];
  const total=state.free, step=200000;
  const initial=Math.floor(total/state.goals.length/step)*step;
  const remainder=total-initial*state.goals.length;
  const values=state.goals.map((_,i)=>initial+(i===0?remainder:0));
  let selected=0, drag=null;
  open('Баблишко для будущего', `<p class="muted">Выберите цель. Потяните за границу цветного сектора, чтобы изменить сумму. Шаг — 2 000 ₽. Начальные суммы кратны 2 000 ₽. Остаток добавлен первой цели по приоритету.</p><div class="allocation-chart"><svg id="allocation-chart" viewBox="0 0 320 320" aria-label="Распределение денег по целям"></svg><div class="chart-center"><span id="chart-name"></span><strong id="chart-value"></strong><small id="chart-percent"></small></div></div><div class="allocation-total">Распределяем <strong>${rub(total)}</strong></div><div class="allocation-legend">${state.goals.map((g,i)=>`<div class="allocation-item"><button type="button" class="goal-select" data-select="${i}"><span class="color-dot color-${i%6}"></span><span>${esc(g.name)}</span></button><div class="allocation-money"><input aria-label="Сумма для ${esc(g.name)}" type="number" class="allocation" data-index="${i}" min="0" max="${total/100}" step="0.01" value="${values[i]/100}"><span>₽</span></div></div>`).join('')}</div><div class="allocation-left">Не распределено <strong id="allocation-left"></strong></div>`,()=>{const allocations={};state.goals.forEach((g,i)=>allocations[g.id]=values[i]);return action('allocate',{allocations});});
  const svg=$('#allocation-chart');
  const inputs=[...modal.querySelectorAll('.allocation')];
  const point=(angle,r)=>[160+Math.sin(angle)*r,160-Math.cos(angle)*r];
  const arc=(from,to)=>{
    if(to-from<.000001)return '';
    to=Math.min(to,from+Math.PI*2-.00001);
    const a=point(from,137),b=point(to,137),c=point(to,91),d=point(from,91),large=to-from>Math.PI?1:0;
    return `M ${a} A 137 137 0 ${large} 1 ${b} L ${c} A 91 91 0 ${large} 0 ${d} Z`;
  };
  function draw(){
    let used=values.reduce((a,v)=>a+v,0),left=total-used;
    const all=[...values,Math.max(0,left)];let cumulative=0,paths='',handles='';
    all.forEach((v,i)=>{const from=cumulative/total*Math.PI*2;cumulative+=v;const to=cumulative/total*Math.PI*2;paths+=`<path d="${arc(from,to)}" fill="${i===values.length?'#e7e7e0':colors[i%colors.length]}" class="chart-segment ${i===selected?'selected':''}" data-segment="${i}" stroke="#fffdf8" stroke-width="3"/>`;if(i<values.length){const [x,y]=point(to,116);handles+=`<circle cx="${x}" cy="${y}" r="12" class="chart-handle" data-boundary="${i}" tabindex="0" role="slider" aria-label="Граница: ${esc(state.goals[i].name)}" aria-valuemin="0" aria-valuemax="${total/100}" aria-valuenow="${cumulative/100}"/>`;}});
    svg.innerHTML=paths+handles;
    $('#chart-name').textContent=state.goals[selected].name;
    $('#chart-value').textContent=rub(values[selected]);
    $('#chart-percent').textContent=Math.round(values[selected]/total*100)+'% от свободной суммы';
    $('#allocation-left').textContent=rub(left);
    $('#allocation-left').classList.toggle('danger',left<0);
    $('#submit-modal').disabled=left<0;
    modal.querySelectorAll('[data-select]').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.select)===selected);b.setAttribute('aria-pressed',String(Number(b.dataset.select)===selected));});
  }
  function moveBoundary(i,next){
    const before=values.slice(0,i).reduce((a,v)=>a+v,0);
    const end=i===values.length-1?total:before+values[i]+values[i+1];
    const bounded=Math.max(before,Math.min(end,next));
    const difference=bounded-before-values[i];
    values[i]+=difference;if(i<values.length-1)values[i+1]-=difference;
    inputs.forEach((input,j)=>input.value=values[j]/100);draw();
  }
  function pointerAngle(e){const box=svg.getBoundingClientRect();return (Math.atan2(e.clientX-(box.left+box.width/2),-(e.clientY-(box.top+box.height/2)))+Math.PI*2)%(Math.PI*2);}
  svg.onpointerdown=e=>{
    const handle=e.target.closest('[data-boundary]'),sector=e.target.closest('[data-segment]');
    if(!handle&&!sector)return;
    const i=Number(handle?handle.dataset.boundary:sector.dataset.segment);
    if(i>=values.length)return;
    selected=i;
    if(handle){const cumulative=values.slice(0,i+1).reduce((a,v)=>a+v,0);drag={i,angle:cumulative/total*Math.PI*2,startAngle:cumulative/total*Math.PI*2,startValue:cumulative};svg.setPointerCapture(e.pointerId);e.preventDefault();}
    draw();
  };
  svg.onpointermove=e=>{if(!drag)return;let angle=pointerAngle(e);while(angle-drag.angle>Math.PI)angle-=Math.PI*2;while(angle-drag.angle< -Math.PI)angle+=Math.PI*2;drag.angle=angle;moveBoundary(drag.i,drag.startValue+Math.round((angle-drag.startAngle)/(Math.PI*2)*total/step)*step);};
  svg.onpointerup=svg.onpointercancel=()=>{drag=null;};
  svg.onkeydown=e=>{const handle=e.target.closest('[data-boundary]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const i=Number(handle.dataset.boundary),current=values.slice(0,i+1).reduce((a,v)=>a+v,0);selected=i;moveBoundary(i,current+(['ArrowRight','ArrowUp'].includes(e.key)?step:-step));svg.querySelector(`[data-boundary="${i}"]`).focus();};
  inputs.forEach((input,i)=>input.oninput=()=>{try{const v=money(input.value),others=values.reduce((a,n,j)=>a+(j===i?0:n),0);if(v+others>total)throw Error('Для этой суммы сначала уменьшите другие цели.');values[i]=v;selected=i;$('#modal-error').textContent='';draw();}catch(e){$('#modal-error').textContent=e.message;$('#submit-modal').disabled=true;}});
  modal.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.select);draw();});
  draw();
}
function dailyFlow(){
  let stage='intro',chosen=dateKey(),entries=[],current={category:null,amount:'',tags:[]},busy=false,newCategoryName='';
  const error=$('#modal-error');modal.append(error);
  modal.classList.add('daily-dialog');
  $('#modal-error').textContent='';
  modal.showModal();
  modal.addEventListener('close',()=>modal.classList.remove('daily-dialog'),{once:true});
  const dayLabel=()=>chosen===dateKey()?'Сегодня':new Date(chosen+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  const go=next=>{stage=next;draw();};
  const category=()=>state.categories.find(c=>c.id===current.category);
  function draw(){
    $('#modal-title').textContent=stage==='done'?'День завершён':`Ваш день / ${dayLabel()}`;
    $('#modal-error').textContent='';
    const titles={intro:'Как прошёл день?',date:'За какой день?',category:'На что потратили?',newCategory:'Как назовём категорию?',newCategoryIcon:'Выберите пиктограмму.',amount:'Сколько потратили?',tags:'Добавим детали?',more:'Были ещё расходы?',review:entries.length?'Всё верно?':'Сегодня без расходов?',done:'Готово. Можно выдохнуть.'};
    const steps={intro:0,date:0,category:1,newCategory:1,newCategoryIcon:1,amount:2,tags:2,more:3,review:4,done:4};
    let body='',buttons='';
    if(stage==='intro'){body='<p class="daily-copy">Вспомним расходы по одному.<br>Записи добавятся только в конце.</p>';buttons='<button class="primary" data-go="category">Начать →</button><button class="quiet" data-go="date">Заполнить другой день</button><button class="quiet" data-go="review">Сегодня не было расходов</button>';}
    if(stage==='date'){body=`<label for="daily-date">День в текущем месяце</label><input id="daily-date" type="date" min="${state.month}-01" max="${dateKey()}" value="${chosen}" required>`;buttons='<button class="primary" id="daily-date-next">Далее →</button><button class="quiet" data-go="intro">Назад</button>';}
    if(stage==='category'){body=`<p class="daily-copy">${entries.length?'Следующий расход.':'Выберите одну категорию.'}</p><div class="daily-categories">${state.categories.map((c,i)=>`<button type="button" data-daily-category="${c.id}"><span class="category-number">${String(i+1).padStart(2,'0')}</span>${esc(c.name)}<span>→</span></button>`).join('')}</div>`;buttons='<button class="quiet" data-go="newCategory">+ Новая категория</button><button class="quiet" data-go="intro">Назад</button>';}
    if(stage==='newCategory'){body='<label for="daily-name">Название</label><input id="daily-name" maxlength="60" placeholder="Например, здоровье" required>';buttons='<button class="primary" id="daily-create-category">Создать →</button><button class="quiet" data-go="category">Назад</button>';}
    if(stage==='newCategoryIcon'){body=iconPicker();buttons='<button class="quiet" data-go="newCategory">Назад</button>';}
    if(stage==='amount'){body=`<p class="daily-copy">${esc(category()?.name||'')}</p><label for="daily-amount" class="sr-only">Сумма расхода, ₽</label><div class="daily-amount-wrap"><input id="daily-amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${esc(current.amount)}" placeholder="0" required><span>₽</span></div>${current.tags.length?`<div class="tags">${current.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}`;buttons='<button class="primary" id="daily-amount-next">Далее →</button><button class="quiet" id="daily-add-tags">Добавить теги — по желанию</button><button class="quiet" data-go="category">Назад</button>';}
    if(stage==='tags'){body=`<p class="daily-copy">${esc(category()?.name||'')} · необязательно</p><label for="daily-tags">Теги через запятую</label><input id="daily-tags" maxlength="600" value="${esc(current.tags.join(', '))}" placeholder="Например, бензин, парковка"><div class="tags">${(category()?.tags||[]).map(t=>`<button type="button" class="tag" data-daily-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;buttons='<button class="primary" id="daily-tags-next">Готово →</button><button class="quiet" data-go="amount">Пропустить</button>';}
    if(stage==='more'){const last=entries.at(-1);body=`<div class="daily-record"><span>Добавлено в черновик</span><strong>${esc(state.categories.find(c=>c.id===last.category)?.name)}</strong><b>${rub(last.amount)}</b></div><p class="daily-copy">Можно записать ещё одну категорию<br>или закончить на сегодня.</p>`;buttons='<button class="primary" id="daily-another">Да, ещё один →</button><button id="daily-finish">Нет, это всё →</button><button class="quiet" id="daily-edit-last">Изменить этот расход</button>';}
    if(stage==='review'){body=entries.length?`<p class="daily-copy">${dayLabel()} · ${entries.length} записей</p><div class="daily-review">${entries.map((e,i)=>`<div class="row"><div><strong>${esc(state.categories.find(c=>c.id===e.category)?.name)}</strong><div class="tags">${e.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div><div><b>${rub(e.amount)}</b><button class="quiet" data-remove-entry="${i}" aria-label="Убрать расход ${i+1}">×</button></div></div>`).join('')}</div><div class="daily-total"><span>Итого за этот ввод</span><strong>${rub(entries.reduce((a,e)=>a+e.amount,0))}</strong></div>`:'<p class="daily-copy">Отметим день завершённым.<br>Ничего записывать не нужно.</p>';buttons='<button class="primary" id="daily-save">Завершить день ✓</button><button class="quiet" id="daily-review-back">Добавить расход</button>';}
    if(stage==='done'){body=`<div class="daily-check">✓</div><p class="daily-copy">${entries.length?`Записано ${rub(entries.reduce((a,e)=>a+e.amount,0))}.`:'День отмечен без расходов.'}<br>${window.KOPIT_DEMO?'В демо всё сбросится после перезагрузки.':'Все записи сохранены.'}</p>`;buttons='<button class="primary" id="daily-done">Отлично</button>';}
    $('#modal-body').innerHTML=`<div class="daily-progress" aria-label="Шаг ${steps[stage]} из 4">${[1,2,3,4].map(n=>`<span class="${steps[stage]>=n?'filled':''}"></span>`).join('')}</div><section class="daily-step"><h2>${titles[stage]}</h2>${body}</section><div class="daily-buttons">${buttons}</div>`;
    modal.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{if(stage==='amount')current.amount=$('#daily-amount').value;go(b.dataset.go);});
    modal.querySelectorAll('[data-daily-category]').forEach(b=>b.onclick=()=>{current.category=b.dataset.dailyCategory;current.tags=[];go('amount');});
    if(stage==='date')$('#daily-date-next').onclick=()=>{const input=$('#daily-date');if(!input.reportValidity())return;chosen=input.value;go('category');};
    if(stage==='newCategory'){
      $('#daily-name').value=newCategoryName;
      $('#daily-create-category').textContent='Далее →';
      $('#daily-create-category').onclick=()=>{const input=$('#daily-name');if(!input.reportValidity())return;newCategoryName=input.value;go('newCategoryIcon');};
    }
    if(stage==='newCategoryIcon')modal.querySelectorAll('[data-icon-choice]').forEach(button=>button.onclick=async()=>{
      if(busy)return;busy=true;
      modal.querySelectorAll('[data-icon-choice]').forEach(b=>b.disabled=true);
      try{await action('category',{name:newCategoryName,limit:null,icon:button.dataset.iconChoice});current.category=state.categories.at(-1).id;go('amount');}
      catch(e){$('#modal-error').textContent=e.message;modal.querySelectorAll('[data-icon-choice]').forEach(b=>b.disabled=false);}
      finally{busy=false;}
    });
    if(stage==='amount'){
      const capture=()=>{const input=$('#daily-amount');if(!input.reportValidity())return false;current.amount=input.value;return true;};
      $('#daily-amount-next').onclick=()=>{try{if(!capture())return;entries.push({category:current.category,amount:money(current.amount),tags:[...current.tags]});go('more');}catch(e){$('#modal-error').textContent=e.message;}};
      $('#daily-add-tags').onclick=()=>{current.amount=$('#daily-amount').value;go('tags');};
      $('#daily-amount').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#daily-amount-next').click();}};
    }
    if(stage==='tags'){
      modal.querySelectorAll('[data-daily-tag]').forEach(b=>b.onclick=()=>{const input=$('#daily-tags'),tags=input.value.split(',').map(t=>t.trim()).filter(Boolean);if(!tags.includes(b.dataset.dailyTag))tags.push(b.dataset.dailyTag);input.value=tags.join(', ');});
      $('#daily-tags-next').onclick=()=>{const tags=[...new Set($('#daily-tags').value.split(',').map(t=>t.trim()).filter(Boolean))];if(tags.length>10||tags.some(t=>t.length>60)){$('#modal-error').textContent='До 10 тегов, каждый не длиннее 60 символов.';return;}current.tags=tags;go('amount');};
    }
    if(stage==='more'){
      $('#daily-another').onclick=()=>{current={category:null,amount:'',tags:[]};go('category');};
      $('#daily-finish').onclick=()=>go('review');
      $('#daily-edit-last').onclick=()=>{const e=entries.pop();current={...e,amount:e.amount/100};go('amount');};
    }
    if(stage==='review'){
      modal.querySelectorAll('[data-remove-entry]').forEach(b=>b.onclick=()=>{entries.splice(Number(b.dataset.removeEntry),1);draw();});
      $('#daily-review-back').onclick=()=>{current={category:null,amount:'',tags:[]};go('category');};
      $('#daily-save').onclick=async()=>{if(busy)return;busy=true;$('#daily-save').disabled=true;try{await action('daily_expenses',{date:chosen,entries});go('done');}catch(e){$('#modal-error').textContent=e.message;$('#daily-save').disabled=false;}finally{busy=false;}};
    }
    if(stage==='done')$('#daily-done').onclick=()=>modal.close();
  }
  draw();
}

function remind(){if(!state?.reminders.enabled)return;const now=dateNow(),key=dateKey(),hm=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;const daily=hm>=state.reminders.daily&&!(state.checked_days||[]).includes(key)&&!state.transactions.some(t=>t.date===key&&t.kind==='expense'),monthly=now.getDate()===state.reminders.day;for(const [kind,show,text] of [['daily',daily,'Пара минут для себя: запишите сегодняшние расходы.'],['monthly',monthly,'Начало нового периода: проверьте бюджет, резерв и распределите свободные деньги.']]){const id=`kopit-reminder-${email}-${kind}-${key}`;if(show&&!(window.KOPIT_DEMO?remind.seen?.has(id):sessionStorage.getItem(id))){if(window.KOPIT_DEMO){remind.seen??=new Set();remind.seen.add(id);}else sessionStorage.setItem(id,'1');toast(text);if('Notification'in window&&Notification.permission==='granted'){const notification=new Notification('Копить',{body:text});notification.onclick=()=>{window.focus();if(kind==='daily'&&!modal.open)dailyFlow();notification.close();};}}}}
$('#close-modal').onclick=()=>modal.close();$('#logout').onclick=async()=>{try{await api('logout',{});auth();}catch(e){toast(e.message);}};
setInterval(async()=>{if(!window.KOPIT_DEMO&&state&&!needsSetup()&&!modal.open&&!$('input:focus')&&!$('select:focus')){try{const next=await api('state');if(next.revision!==revision){accept(next);render();}}catch{}}remind();},15000);
// One question per screen; the complete draft is committed in a single action.
let setupDraft=null,setupStage='welcome',setupBack=[],setupSaving=false;
function needsSetup(){return state&&state.onboarding_complete!==true&&!state.transactions.length&&!state.categories.length&&!state.balance&&!state.reserve&&!state.free&&!state.goals.some(g=>g.saved||!g.reserve);}
function startSetup(){
 setupDraft={budget:17500000,total:0,balance:0,spent:0,reserve:0,cushion:0,goals:[],categories:[],goalName:'',goalTarget:0,goalSaved:0,categoryName:'',categoryLimit:null};setupStage='welcome';setupBack=[];drawSetup();
}
function drawSetup(){
 const d=setupDraft,stage=setupStage;
 const next=(target)=>{setupBack.push(stage);setupStage=target;drawSetup();window.scrollTo(0,0);};
 const field=(label,value,placeholder='0')=>`<label for="setup-value">${label}</label><input id="setup-value" type="text" inputmode="decimal" autocomplete="off" value="${value===null?'':esc(value/100)}" placeholder="${placeholder}">`;
 const nameField=(label,value)=>`<label for="setup-name">${label}</label><input id="setup-name" type="text" maxlength="60" autocomplete="off" value="${esc(value)}" required>`;
 let heading='',copy='',body='',button='Далее',extra='';
 const sections={welcome:1,budget:1,total:2,balance:2,spent:2,reserve:2,cushion:3,goals:3,goalName:3,goalTarget:3,goalSaved:3,categories:4,categoryName:4,categoryLimit:4,review:5};
 if(stage==='welcome'){heading='Настроим ваш бюджет';copy='Ответьте на несколько вопросов: сколько вы планируете тратить, какие суммы уже есть, на что копите и куда обычно тратите. На каждом экране — один шаг.';body='<p>Введённые данные сохранятся после проверки в конце. Если закрыть страницу раньше, настройку нужно будет начать заново.</p>';button='Начать';}
 if(stage==='budget'){heading='Сколько планируете тратить в месяц?';copy='Укажите бюджет полного месяца. Его можно будет изменить в настройках.';body=field('Бюджет на месяц, ₽',d.budget);}
 if(stage==='total'){heading='Сколько денег у вас сейчас есть?';copy='Укажите общую доступную сумму на текущий месяц, резерв и будущие распределения. Деньги, уже отложенные на конкретные цели, сюда не включайте: их укажем отдельно.';body=field('Доступные деньги, ₽',d.total);}
 if(stage==='balance'){heading='Сколько оставите на остаток месяца?';copy=`Это сумма для расходов с сегодняшнего дня до конца месяца. Доступно ${rub(d.total)}, месячный бюджет ${rub(d.budget)}.`;body=field('Остаток на месяц, ₽',d.balance);}
 if(stage==='spent'){heading='Сколько уже потратили в этом месяце?';copy='Общая сумма до начала работы в приложении. Она учитывается в месячном бюджете, но не создаёт отдельные расходы в истории. Если начинаете учёт с нуля, оставьте 0.';body=field('Уже потрачено, ₽',d.spent);}
 if(stage==='reserve'){heading='Сколько отложите на следующий месяц?';copy=`После текущего остатка осталось ${rub(d.total-d.balance)}. Резерв на один месяц — до ${rub(d.budget)}. Остальное останется для распределения по целям.`;body=field('Резерв на следующий месяц, ₽',d.reserve);}
 if(stage==='cushion'){heading='Есть накопления на второй месяц запаса?';copy='Создадим отдельную цель «Ещё один месяц запаса». Введите сумму, уже отложенную на неё. Она не должна входить в общую доступную сумму, которую вы указали раньше. Если накоплений нет, оставьте 0.';body=field('Уже отложено на второй месяц, ₽',d.cushion);}
 if(stage==='goals'){heading='На что ещё хотите накопить?';copy='Добавьте свои цели по одной. Для каждой укажем нужную сумму и то, что уже накоплено. Можно продолжить без дополнительных целей.';body=`<div class="setup-list"><div class="row"><div><strong>Ещё один месяц запаса</strong><small>${rub(d.cushion)} из ${rub(d.budget)}</small></div></div>${d.goals.map((g,i)=>`<div class="row"><div><strong>${esc(g.name)}</strong><small>${rub(g.saved)} из ${rub(g.target)}</small></div><button type="button" class="quiet" data-remove-goal="${i}" aria-label="Удалить цель ${esc(g.name)}">Убрать</button></div>`).join('')}</div>`;extra='<button type="button" id="setup-add-goal">+ Добавить цель</button>';}
 if(stage==='goalName'){heading='Как называется цель?';copy='Например, отпуск или новый ноутбук.';body=nameField('Название цели',d.goalName);}
 if(stage==='goalTarget'){heading='Сколько нужно накопить?';copy=`Цель: ${d.goalName}.`;body=field('Сумма цели, ₽',d.goalTarget);}
 if(stage==='goalSaved'){heading='Сколько уже накоплено на эту цель?';copy=`Цель: ${d.goalName}. Эти накопления должны быть отдельными от общей доступной суммы, указанной раньше.`;body=field('Уже накоплено, ₽',d.goalSaved);button='Добавить цель';}
 if(stage==='categories'){heading='На что обычно тратите?';copy='Добавьте основные категории по одной. Можно продолжить без категорий и создать их позже.';body=`<div class="setup-list">${d.categories.map((c,i)=>`<div class="row"><div><strong>${esc(c.name)}</strong><small>${c.limit===null?'Без лимита':'Лимит '+rub(c.limit)}</small></div><button type="button" class="quiet" data-remove-category="${i}" aria-label="Удалить категорию ${esc(c.name)}">Убрать</button></div>`).join('')||'<p class="muted">Пока нет категорий.</p>'}</div>`;extra='<button type="button" id="setup-add-category">+ Добавить категорию</button>';}
 if(stage==='categoryName'){heading='Как назвать категорию?';copy='Например, еда, жильё или машина.';body=nameField('Название категории',d.categoryName);}
 if(stage==='categoryLimit'){heading='Нужен лимит для этой категории?';copy=`Категория: ${d.categoryName}. Сумма всех лимитов не должна превышать ${rub(d.budget)}. Можно оставить поле пустым.`;body=field('Месячный лимит, ₽ — необязательно',d.categoryLimit,'Без лимита');button='Добавить категорию';}
 if(stage==='review'){
  heading='Проверьте начальные данные';copy='Это стартовые остатки, а не новые поступления или расходы. После сохранения можно записывать обычные операции.';button='Сохранить и начать';
  body=`<dl class="setup-summary"><dt>Бюджет месяца</dt><dd>${rub(d.budget)}</dd><dt>Осталось на месяц</dt><dd>${rub(d.balance)}</dd><dt>Уже потрачено</dt><dd>${rub(d.spent)}</dd><dt>Резерв следующего месяца</dt><dd>${rub(d.reserve)}</dd><dt>Для распределения по целям</dt><dd>${rub(d.total-d.balance-d.reserve)}</dd><dt>Уже накоплено в целях</dt><dd>${rub(d.cushion+d.goals.reduce((s,g)=>s+g.saved,0))}</dd><dt>Всего денег с накоплениями</dt><dd>${rub(d.total+d.cushion+d.goals.reduce((s,g)=>s+g.saved,0))}</dd></dl><p><strong>Цели:</strong> Ещё один месяц запаса${d.goals.map(g=>', '+esc(g.name)).join('')}.</p><p><strong>Категории:</strong> ${d.categories.map(c=>esc(c.name)+(c.limit===null?' (без лимита)':' ('+rub(c.limit)+')')).join(', ')||'пока не добавлены'}.</p>${d.reserve<d.budget||d.balance+d.spent<d.budget?'<div class="note">Распределение новых денег по целям станет доступно, когда обеспечены бюджет текущего месяца и резерв на следующий.</div>':''}`;
 }
 app.innerHTML=`<section class="setup" aria-label="Первоначальная настройка"><div class="eyebrow">Начало работы · ${sections[stage]} / 5</div><progress class="setup-progress" max="5" value="${sections[stage]}" aria-label="Этап ${sections[stage]} из 5"></progress><h1 tabindex="-1">${esc(heading)}</h1><p class="setup-copy">${esc(copy)}</p><form id="setup-form" novalidate>${body}<p id="setup-error" role="alert"></p><div class="setup-actions">${extra}<button type="submit" class="primary" id="setup-next">${button}</button>${setupBack.length?'<button type="button" class="quiet" id="setup-back">Назад</button>':''}</div></form><p class="muted setup-save-note">Сохраним все ответы после кнопки «Сохранить и начать».</p></section>`;
 $('h1',app).focus({preventScroll:true});
 if($('#setup-back'))$('#setup-back').onclick=()=>{if(setupSaving)return;setupStage=setupBack.pop();drawSetup();};
 if($('#setup-add-goal'))$('#setup-add-goal').onclick=()=>{d.goalName='';d.goalTarget=0;d.goalSaved=0;next('goalName');};
 if($('#setup-add-category'))$('#setup-add-category').onclick=()=>{d.categoryName='';d.categoryLimit=null;next('categoryName');};
 for(const type of ['goal','category'])app.querySelectorAll(`[data-remove-${type}]`).forEach(b=>b.onclick=()=>{d[type==='goal'?'goals':'categories'].splice(Number(b.dataset[type==='goal'?'removeGoal':'removeCategory']),1);drawSetup();});
 $('#setup-form').onsubmit=async e=>{
  e.preventDefault();if(setupSaving)return;
  try{
   const value=()=>{const n=money($('#setup-value').value);if(n>100000000000)throw Error('Укажите сумму не больше 1 000 000 000 ₽.');return n;};
   const name=()=>{const n=$('#setup-name').value.trim();if(!n||n.length>60)throw Error('Введите название от 1 до 60 символов.');return n;};
   if(stage==='welcome')return next('budget');
   if(stage==='budget'){const n=value();if(!n)throw Error('Бюджет должен быть больше нуля.');d.budget=n;return next('total');}
   if(stage==='total'){d.total=value();return next('balance');}
   if(stage==='balance'){const n=value();if(n>d.total||n>d.budget)throw Error('Остаток не должен превышать доступные деньги или бюджет месяца.');d.balance=n;return next('spent');}
   if(stage==='spent'){const n=value();d.spent=n;d.reserve=Math.min(d.budget,d.total-d.balance);return next('reserve');}
   if(stage==='reserve'){const n=value();if(n>d.budget||n>d.total-d.balance)throw Error('Резерв превышает месячный бюджет или доступную сумму.');d.reserve=n;return next('cushion');}
   if(stage==='cushion'){d.cushion=value();return next('goals');}
   if(stage==='goals')return next('categories');
   if(stage==='goalName'){d.goalName=name();return next('goalTarget');}
   if(stage==='goalTarget'){const n=value();if(!n)throw Error('Сумма цели должна быть больше нуля.');d.goalTarget=n;return next('goalSaved');}
   if(stage==='goalSaved'){d.goalSaved=value();if(d.goals.length>=99)throw Error('Можно добавить не больше 99 дополнительных целей.');d.goals.push({name:d.goalName,target:d.goalTarget,saved:d.goalSaved,reserve:false,icon:itemIcon({name:d.goalName})});setupBack=setupBack.slice(0,setupBack.lastIndexOf('goals'));setupStage='goals';return drawSetup();}
   if(stage==='categories')return next('review');
   if(stage==='categoryName'){d.categoryName=name();return next('categoryLimit');}
   if(stage==='categoryLimit'){const raw=$('#setup-value').value.trim(),limit=raw===''?null:value();if(d.categories.reduce((s,c)=>s+(c.limit||0),0)+(limit||0)>d.budget)throw Error('Сумма лимитов категорий превышает бюджет месяца.');if(d.categories.length>=100)throw Error('Можно добавить не больше 100 категорий.');d.categories.push({name:d.categoryName,limit,icon:itemIcon({name:d.categoryName})});setupBack=setupBack.slice(0,setupBack.lastIndexOf('categories'));setupStage='categories';return drawSetup();}
   if(stage==='review'){
    setupSaving=true;app.querySelectorAll('button').forEach(b=>b.disabled=true);
    await action('onboarding',{budget:d.budget,total:d.total,balance:d.balance,spent:d.spent,reserve:d.reserve,goals:[{name:'Ещё один месяц запаса',target:d.budget,saved:d.cushion,reserve:true,icon:'reserve'},...d.goals],categories:d.categories});
    setupDraft=null;toast('Настройка сохранена. Можно записывать доходы и расходы.');
   }
  }catch(err){if(!needsSetup()){setupDraft=null;render();toast(err.message);return;}if($('#setup-error'))$('#setup-error').textContent=err.message;else toast(err.message);app.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{setupSaving=false;}
 };
}

load();
