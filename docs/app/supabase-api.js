// Native HTTPS client for Supabase Auth and the versioned database RPCs.
// No SDK/CDN dependencies. Opt-in idempotent saves keep one pending snapshot
// per project/user locally until the server confirms its operation identifier.
(()=>{
  let session=null,last=null,refreshing=null,recovery=false,initialized=false,lastEmail='',epoch=0,uncertain=false,owner=null,resolving=null;
  const config=()=>{
    const c=window.KOPIT_SUPABASE_CONFIG||{};
    if(!c.url||!c.key){const e=Error('Supabase ещё не подключён. Укажите URL проекта и публичный ключ.');e.code='not_configured';throw e;}
    const url=new URL(c.url);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Укажите HTTPS URL проекта Supabase без пути.');
    if(c.key.startsWith('sb_secret_'))throw Error('Для браузера нужен publishable key, не secret key.');
    if(!c.key.startsWith('sb_publishable_')){
      try{const claim=JSON.parse(atob(c.key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(claim.role!=='anon')throw Error();}
      catch{throw Error('Для браузера нужен публичный publishable или anon key.');}
    }
    return {url:url.origin,key:c.key};
  };
  const storageKey=()=>`kopit-auth:${config().url}`;
  function keep(value){
    session=value;
    try{if(value)localStorage.setItem(storageKey(),JSON.stringify(value));else localStorage.removeItem(storageKey());}catch{}
  }
  function initialize(){
    if(initialized)return;initialized=true;
    const hash=new URLSearchParams(location.hash.slice(1));
    if(hash.get('access_token')&&hash.get('refresh_token')){
      recovery=hash.get('type')==='recovery';
      keep({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()/1000+Number(hash.get('expires_in')||3600)});
      window.history.replaceState(null,'',location.pathname+location.search);
    }else{try{session=JSON.parse(localStorage.getItem(storageKey())||'null');}catch{session=null;}}
    const error=hash.get('error_description');
    if(error){window.history.replaceState(null,'',location.pathname+location.search);throw Error('Ссылка подтверждения недействительна или истекла. Запросите новую ссылку.');}
  }
  async function request(path,body,token){
    const c=config();let response;
    try{response=await fetch(c.url+path,{method:body!==undefined?'POST':'GET',headers:{apikey:c.key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined,credentials:'omit'});}
    catch{const e=Error('Нет соединения с Supabase. Проверьте подключение.');e.code='network_error';throw e;}
    let data;try{data=await response.json();}catch{const e=Error('Не удалось прочитать ответ Supabase.');e.code='invalid_response';throw e;}
    if(!response.ok){
      let message=data.msg||data.message||data.error_description||data.error||'Не удалось выполнить запрос.';
      if(data.code==='K4092')message='Правила зарплаты обновлены. Обновите приложение перед сохранением.';
      if(data.code==='K4094')message='Начался новый месяц. Данные обновлены; повторите действие.';
      const serverMessages={MONTH_NOT_ENDED:'Месяц ещё не завершён.',FREE_MUST_BE_ASSIGNED:'Сначала распределите свободные деньги по целям или в резерв.',CONFIRM_ADJUSTMENT:'Подтвердите корректировку накоплений.',LEGACY_INCOME_REVIEW:'Для старого дохода нужна отдельная сверка распределения.',INCOME_ALREADY_USED:'Этот доход уже использован. Исправление не должно списывать накопления целей или создавать отрицательный резерв.',CLOSED_MONTH_READ_ONLY:'Закрытые месяцы доступны только для просмотра.',GOAL_NOT_REACHED:'Завершить можно только достигнутую цель.',INVALID_AMOUNT:'Укажите корректную сумму.',MONTH_NOT_FUNDED:'Сначала обеспечьте текущий и следующий месяц.',INSUFFICIENT_FREE:'Для распределения не хватает денег.',INSUFFICIENT_GOAL:'В этой цели недостаточно накоплений.',CATEGORY_LIMITS_EXCEEDED:'Сумма лимитов категорий превышает бюджет.',OPENING_EXCEEDED:'Подробные записи превышают начальную сумму.',INVALID_DATE:'Выберите день текущего месяца не позднее сегодня.',ALREADY_CONFIGURED:'Начальная настройка уже выполнена.',STATE_REQUIRES_REVIEW:'Данные требуют сверки. Сохранение остановлено.',INVALID_COMMAND:'Сервер отклонил некорректное действие.',INVALID_TEXT:'Введите название от 1 до 60 символов.',NOT_FOUND:'Запись не найдена. Обновите страницу.',INVALID_TAGS:'Проверьте теги расходов.',AMOUNT_OVERFLOW:'Сумма выходит за безопасный диапазон.'};
      if(serverMessages[message])message=serverMessages[message];
      if(data.code==='K4093')message='Идентификатор операции уже использован с другими данными. Обратитесь в поддержку.';
      if(data.code==='K4090')message='Данные изменились на другом устройстве. Страница обновлена: повторите действие.';
      if(data.error_code==='invalid_credentials')message='Неверная почта или пароль.';
      if(data.error_code==='email_not_confirmed')message='Подтвердите почту по ссылке из письма.';
      if(data.error_code==='over_email_send_rate_limit'||data.code==='over_email_send_rate_limit'||(response.status===429&&/email rate limit exceeded/i.test(message)))message='Временно исчерпан лимит отправки писем. Попробуйте позже. Это общий лимит сервиса для проекта; частые повторы не помогут.';
      if(data.code==='PGRST202')message='База ещё не настроена. Выполните SQL-миграцию в Supabase SQL Editor.';
      const e=Error(message);e.status=['K4090','K4094'].includes(data.code)?409:response.status;e.serverCode=data.code;throw e;
    }
    return data;
  }
  const tokenSession=data=>({...data,expires_at:data.expires_at||Date.now()/1000+(data.expires_in||3600)});
  async function access(){
    initialize();
    if(!session?.access_token){const e=Error('Войдите в аккаунт.');e.status=401;throw e;}
    if(session.expires_at<=Date.now()/1000+60){
      if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(data=>{keep(tokenSession(data));return session.access_token;}).catch(e=>{if(e.status===400||e.status===401)keep(null);throw e;}).finally(()=>{refreshing=null;});
      return refreshing;
    }
    return session.access_token;
  }
  async function user(){return request('/auth/v1/user',undefined,await access());}
  const redirect=()=>location.origin+location.pathname;
  function current(expected){if(expected!==epoch){const e=Error('Сессия изменилась. Войдите снова.');e.status=401;throw e;}}
  function latest(result){if(!last||result.revision>=last.revision)last=result;return last;}
  function uncertainSave(){const e=Error('Не удалось подтвердить сохранение. Операция могла сохраниться. Перезагрузите страницу и проверьте историю перед повтором.');e.code='save_uncertain';return e;}
  const commandsEnabled=()=>window.KOPIT_SUPABASE_CONFIG.server_commands===true;
  const onceEnabled=()=>commandsEnabled()||window.KOPIT_SUPABASE_CONFIG.idempotent_saves===true;
  const requestId=body=>body.p_command?.operation_id||body.p_operation_id;
  const requestRevision=body=>body.p_command?.expected_revision??body.p_revision;
  const pendingKey=()=>`${commandsEnabled()?'kopit-command-pending':'kopit-pending'}:${config().url}:${owner}`;
  function pending(){
    if(!owner)throw Error('Сначала загрузите аккаунт.');
    try{return JSON.parse(localStorage.getItem(pendingKey())||'null');}
    catch{throw Error('Не удалось прочитать незавершённую операцию. Проверьте доступ к хранилищу браузера.');}
  }
  function remember(value){
    try{localStorage.setItem(pendingKey(),JSON.stringify(value));}
    catch{throw Error('Не удалось сохранить запрос для защиты от повтора. Разрешите хранение данных в браузере. Операция не отправлена.');}
  }
  async function sendOnce(body,expected){
    const key=pendingKey();
    const forget=()=>{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&requestId(saved)===requestId(body))localStorage.removeItem(key);};
    try{
      const result=await request(body.p_command?'/rest/v1/rpc/kopit_command_v2':'/rest/v1/rpc/kopit_save_salary_once',body,await access());
      current(expected);
      if(!result||!Number.isSafeInteger(result.revision)||result.revision<=requestRevision(body)||!result.state||typeof result.state!=='object'||Array.isArray(result.state)||result.operation?.id!==requestId(body)||!['applied','replayed'].includes(result.operation.status)||!Number.isSafeInteger(result.operation.applied_revision)||result.operation.applied_revision!==requestRevision(body)+1||result.operation.applied_revision>result.revision||(body.p_command&&(result.rules_version!==2||result.operation.rules_version!==2))){
        const e=Error('Некорректное подтверждение операции.');e.code='invalid_response';throw e;
      }
      forget();
      return latest(result);
    }catch(e){
      if(expected===epoch){
        if(e.code==='network_error'||e.code==='invalid_response'||e.status>=500){uncertain=true;throw uncertainSave();}
        // A revision conflict means this exact save did not commit. Keep all other
        // rejections for inspection; never silently downgrade to the old RPC.
        if(e.status===409||(commandsEnabled()&&e.serverCode==='22023'))forget();
      }
      throw e;
    }
  }
  async function resume(expected){
    const body=pending();if(!body)return;
    if(!requestId(body)||!Number.isSafeInteger(requestRevision(body))||(commandsEnabled()?body.p_command?.api_version!==2:body.p_state?.salary_version!==2))throw Error('Незавершённая операция повреждена. Обратитесь в поддержку.');
    if(uncertain)throw uncertainSave();
    if(!resolving)resolving=sendOnce(body,expected).finally(()=>{resolving=null;});
    return resolving;
  }
  async function save(next,revision){
    if(uncertain)throw uncertainSave();
    const expected=epoch;
    if(onceEnabled()&&next.salary_version===2){
      if(pending())throw uncertainSave();
      const body={p_operation_id:crypto.randomUUID(),p_state:next,p_revision:revision};
      remember(body);return sendOnce(body,expected);
    }
    try{
      const saved=await request(next.salary_version===2?'/rest/v1/rpc/kopit_save_salary':'/rest/v1/rpc/kopit_save',{p_state:next,p_revision:revision},await access());
      current(expected);
      if(!saved||!Number.isSafeInteger(saved.revision)||saved.revision<=revision||!saved.state||typeof saved.state!=='object'||Array.isArray(saved.state)){
        const e=Error('Некорректное подтверждение сохранения.');e.code='invalid_response';throw e;
      }
      return latest(saved);
    }catch(e){
      if(expected===epoch&&(e.code==='network_error'||e.code==='invalid_response'||e.status>=500)){uncertain=true;throw uncertainSave();}
      throw e;
    }
  }
  window.cloudApi=async(path,p)=>{
    config();initialize();
    if(path==='register'){
      const result=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect()),{email:p.email,password:p.password});
      if(result.access_token){epoch++;last=null;owner=null;uncertain=false;keep(tokenSession(result));return {ok:true};}
      return {confirmation_required:true};
    }
    if(path==='login'){const data=await request('/auth/v1/token?grant_type=password',{email:p.email,password:p.password});epoch++;last=null;owner=null;uncertain=false;keep(tokenSession(data));return {ok:true};}
    if(path==='recover'){await request('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect()),{email:p.email});return {ok:true};}
    if(path==='password'){
      const c=config(),token=await access();
      let response;try{response=await fetch(c.url+'/auth/v1/user',{method:'PUT',headers:{apikey:c.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({password:p.password}),credentials:'omit'});}catch{throw Error('Нет соединения. Пароль не изменён.');}
      if(!response.ok)throw Error('Не удалось изменить пароль. Откройте новую ссылку восстановления.');recovery=false;return {ok:true};
    }
    if(path==='logout'){try{const registration=await navigator.serviceWorker?.getRegistration(new URL('./',location.href).href);const subscription=await registration?.pushManager.getSubscription();if(subscription){await request('/rest/v1/rpc/kopit_push_unsubscribe',{p_endpoint:subscription.endpoint},await access());await subscription.unsubscribe();}}catch{}await request('/auth/v1/logout',{},await access());epoch++;keep(null);last=null;owner=null;uncertain=false;return {ok:true};}
    if(recovery){const e=Error('Укажите новый пароль.');e.code='recovery_required';throw e;}
    if(path==='state'){
      const expected=epoch;
      const token=await access();
      const account=await request('/auth/v1/user',undefined,token);
      current(expected);
      if(onceEnabled()){
        if(typeof account.id!=='string'||!account.id)throw Error('Не удалось определить владельца аккаунта.');
        owner=account.id;
        if(commandsEnabled()&&localStorage.getItem(`kopit-pending:${config().url}:${owner}`))throw Error('Остался незавершённый запрос предыдущей версии. Сначала нужна сверка его результата.');
        if(!uncertain){try{await resume(expected);}catch(e){if(e.status!==409)throw e;}}
      }
      let result=await request(commandsEnabled()?'/rest/v1/rpc/kopit_load_v2':'/rest/v1/rpc/kopit_load',{},token);
      current(expected);
      if(last&&result.revision<last.revision)return {...last,email:lastEmail};
      if(commandsEnabled()){if(result.rules_version!==2||result.state?.salary_version!==2)throw Error('Серверные правила ещё не подключены.');result=latest(result);lastEmail=account.email;return {...result,email:lastEmail};}
      const upgraded=KopitFinance.upgrade(result.state);
      const rolled=KopitFinance.rollover(upgraded.state,dateKey());
      rolled.changed=rolled.changed||upgraded.changed;
      if(rolled.changed){try{result=await save(rolled.state,result.revision);}catch(e){if(e.status!==409)throw e;throw Error('Данные изменились во время обновления. Перезагрузите страницу.');}}
      current(expected);result=latest(result);lastEmail=account.email;return {...result,email:lastEmail};
    }
    if(['push_key','push_subscribe','push_unsubscribe'].includes(path)){
      const rpc={push_key:'kopit_push_public_key',push_subscribe:'kopit_push_subscribe',push_unsubscribe:'kopit_push_unsubscribe'}[path];
      return request('/rest/v1/rpc/'+rpc,path==='push_subscribe'?{p_subscription:p.subscription}:path==='push_unsubscribe'?{p_endpoint:p.endpoint}:{},await access());
    }
    if(path==='action'){
      if(uncertain)throw uncertainSave();
      if(!last||last.revision!==p.revision){const e=Error('Данные изменились. Повторите действие.');e.status=409;throw e;}
      if(commandsEnabled()){
        if(pending())throw uncertainSave();
        const {action,revision,...payload}=p;
        const body={p_command:{api_version:2,operation_id:crypto.randomUUID(),expected_revision:revision,expected_month:last.state.month,action,payload}};
        remember(body);const result=await sendOnce(body,epoch);return {...result,email:lastEmail};
      }
      const next=KopitFinance.apply(last.state,p,dateKey());
      const result=await save(next,p.revision);
      return {...result,email:lastEmail};
    }
    throw Error('Неизвестное действие.');
  };
})();
