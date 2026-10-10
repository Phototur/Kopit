// Native HTTPS client for Supabase Auth and the versioned database RPCs.
// No SDK/CDN dependencies; financial data is kept in Supabase, not localStorage.
(()=>{
  let session=null,last=null,refreshing=null,recovery=false,initialized=false,lastEmail='';
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
    catch{throw Error('Нет соединения с Supabase. Изменения не сохранены. Проверьте подключение.');}
    let data;try{data=await response.json();}catch{data={};}
    if(!response.ok){
      let message=data.msg||data.message||data.error_description||data.error||'Не удалось выполнить запрос.';
      if(data.code==='K4090')message='Данные изменились на другом устройстве. Страница обновлена: повторите действие.';
      if(data.error_code==='invalid_credentials')message='Неверная почта или пароль.';
      if(data.error_code==='email_not_confirmed')message='Подтвердите почту по ссылке из письма.';
      if(data.code==='PGRST202')message='База ещё не настроена. Выполните SQL-миграцию в Supabase SQL Editor.';
      const e=Error(message);e.status=data.code==='K4090'?409:response.status;throw e;
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
  async function save(next,revision){
    const saved=await request('/rest/v1/rpc/kopit_save',{p_state:next,p_revision:revision},await access());
    last=saved;return saved;
  }
  window.cloudApi=async(path,p)=>{
    config();initialize();
    if(path==='register'){
      const result=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect()),{email:p.email,password:p.password});
      if(result.access_token){keep(tokenSession(result));return {ok:true};}
      return {confirmation_required:true};
    }
    if(path==='login'){keep(tokenSession(await request('/auth/v1/token?grant_type=password',{email:p.email,password:p.password})));return {ok:true};}
    if(path==='recover'){await request('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect()),{email:p.email});return {ok:true};}
    if(path==='password'){
      const c=config(),token=await access();
      let response;try{response=await fetch(c.url+'/auth/v1/user',{method:'PUT',headers:{apikey:c.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({password:p.password}),credentials:'omit'});}catch{throw Error('Нет соединения. Пароль не изменён.');}
      if(!response.ok)throw Error('Не удалось изменить пароль. Откройте новую ссылку восстановления.');recovery=false;return {ok:true};
    }
    if(path==='logout'){await request('/auth/v1/logout',{},await access());keep(null);last=null;return {ok:true};}
    if(recovery){const e=Error('Укажите новый пароль.');e.code='recovery_required';throw e;}
    if(path==='state'){
      const token=await access();
      const account=await request('/auth/v1/user',undefined,token);
      let result=await request('/rest/v1/rpc/kopit_load',{},token);
      const rolled=KopitFinance.rollover(result.state,dateKey());
      if(rolled.changed){try{result=await save(rolled.state,result.revision);}catch(e){if(e.status!==409)throw e;result=await request('/rest/v1/rpc/kopit_load',{},token);}}
      last=result;lastEmail=account.email;return {...result,email:lastEmail};
    }
    if(path==='action'){
      if(!last||last.revision!==p.revision){const e=Error('Данные изменились. Повторите действие.');e.status=409;throw e;}
      const next=KopitFinance.apply(last.state,p,dateKey());
      const result=await save(next,p.revision);
      return {...result,email:lastEmail};
    }
    throw Error('Неизвестное действие.');
  };
})();
