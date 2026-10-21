// Shared deterministic finance operations; amounts are integer kopecks.
window.KopitFinance=(()=>{
 const newId=()=>crypto.randomUUID();
 function initial(today){return {month:today.slice(0,7),onboarding_complete:false,budget:17500000,balance:0,reserve:0,free:0,categories:[],transactions:[],checked_days:[],goals:[{id:newId(),name:'Ещё один месяц запаса',target:17500000,saved:0,reserve:true,icon:'reserve'}],reminders:{daily:'21:00',day:1,enabled:false},appearance:{icons_only:false}};}
 function upgrade(input){
  const s=structuredClone(input);
  if(s.salary_version===2||!(s.onboarding_complete||s.transactions.length||s.categories.length||s.balance||s.reserve||s.free||s.goals.some(g=>g.saved||!g.reserve)))return {state:s,changed:false};
  const archived=s.goals.filter(g=>g.reserve===true),reserve=s.reserve+archived.reduce((n,g)=>n+g.saved,0);
  if(!Number.isSafeInteger(reserve)||reserve<0)throw Error('Резерв выходит за безопасный диапазон. Нужна сверка данных.');
  s.reserve=reserve;s.goals=s.goals.filter(g=>g.reserve!==true);s.salary_version=2;
  s.salary_migration={system_goals:archived,month:s.month};s.checked_days??=[];s.appearance??={};
  return {state:s,changed:true};
 }
 function salaryApply(input,p,today){
  let s=structuredClone(input);
  const amount=(v,zero=false)=>{if(!Number.isSafeInteger(v)||v<(zero?0:1)||v>100000000000)throw Error('Укажите корректную сумму.');return v;};
  const record=(kind,n,extra)=>s.transactions.push({id:newId(),kind,amount:n,date:today,...extra});
  if(p.action==='salary_onboarding'){
   const reserve=amount(p.reserve,true),total=amount(p.total,true)-reserve;
   if(total<0)throw Error('Резерв превышает фактические деньги.');
   s=apply(s,{...p,action:'onboarding',reserve:0,total},today);s.reserve=reserve;s=upgrade(s).state;
  }else{
   s=rollover(s,today).state;
   if(['expense','daily_expenses','opening_details'].includes(p.action)&&'date' in p){
    const value=p.date;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>today||value.slice(0,7)!==s.month||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Выберите день текущего месяца не позднее сегодня.');
   }
   const spent=()=>((s.opening?.month===s.month?s.opening.spent:0)||0)+s.transactions.filter(t=>t.kind==='expense'&&t.date.startsWith(s.month)).reduce((a,t)=>a+t.amount,0);
   if(p.action==='budget'){
    const value=amount(p.amount);if(s.categories.reduce((n,c)=>n+(c.limit||0),0)>value)throw Error('Сначала уменьшите лимиты категорий.');s.budget=value;
   }else if(p.action==='allocate'){
    if(s.balance<0)throw Error('Сначала покройте перерасход текущего месяца.');
    if(!p.allocations||typeof p.allocations!=='object'||Array.isArray(p.allocations))throw Error('Некорректное распределение.');
    const reserve=amount(p.reserve_amount??0,true),entries=Object.entries(p.allocations),total=entries.reduce((n,[,v])=>n+amount(v,true),0)+reserve;
    if(!entries.length&&!reserve)throw Error('Некорректное распределение.');
    if(total>s.free)throw Error('Для распределения не хватает денег.');
    if(s.reserve<s.budget||s.balance+spent()<s.budget)throw Error('Сначала обеспечьте текущий и следующий месяц.');
    for(const [id,v] of entries){const g=s.goals.find(g=>g.id===id);if(!g)throw Error('Запись не найдена.');g.saved+=v;if(v)record('allocation',v,{goal_name:g.name,...(s.manual_month_close?{goal_id:g.id}:{})});}
    s.reserve+=reserve;if(reserve)record('allocation',reserve,{goal_name:'Резерв будущих зарплат',reserve_transfer:true});s.free-=total;
   }else if(p.action==='opening_set'||p.action==='opening_details'){
    const old=s.opening?.month===s.month?s.opening.spent:0;s.salary_audit??=[];
    if(p.action==='opening_set'){
     const value=amount(p.amount,true);s.balance+=old-value;s.opening={month:s.month,spent:value};s.salary_audit.push({kind:'opening_set',month:s.month,before:old,after:value});
    }else{
     if(!Array.isArray(p.entries)||p.entries.length<1||p.entries.length>100)throw Error('Добавьте от 1 до 100 записей.');
     const total=p.entries.reduce((n,e)=>n+amount(e.amount),0);if(total>old)throw Error('Подробные записи превышают оставшуюся начальную сумму.');
     const balance=s.balance,version=s.salary_version;delete s.salary_version;
     for(const entry of p.entries)s=apply(s,{...entry,action:'expense',date:p.date||today},today);s.salary_version=version;s.balance=balance;s.opening={month:s.month,spent:old-total};
     s.salary_audit.push({kind:'opening_details',month:s.month,amount:total});
    }
   }else{const version=s.salary_version;delete s.salary_version;s=apply(s,p,today);s.salary_version=version;}
  }
  const values=[s.balance,s.reserve,s.free,...s.goals.map(g=>g.saved)],spent=((s.opening?.month===s.month?s.opening.spent:0)||0)+s.transactions.filter(t=>t.kind==='expense'&&t.date.startsWith(s.month)).reduce((n,t)=>n+t.amount,0);
  if([...values,values.reduce((n,v)=>n+v,0),s.goals.reduce((n,g)=>n+g.saved,0),spent,s.balance+spent].some(n=>!Number.isSafeInteger(n))||s.reserve<0||s.free<0||s.goals.some(g=>g.saved<0))throw Error('Сумма выходит за безопасный диапазон.');
  return s;
 }
 function apply(input,p,today){
  if(input.salary_version===2||p.action==='salary_onboarding')return salaryApply(input,p,today);
  if(p.date&&(p.date>today||p.date.slice(0,7)!==input.month||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)))throw Error('Выберите день текущего месяца не позднее сегодня.');
  if(p.action==='daily_expenses'){
   if(!Array.isArray(p.entries)||p.entries.length>100)throw Error('Не больше 100 расходов за один раз.');
   let next=structuredClone(input);
   for(const entry of p.entries)next=apply(next,{...entry,action:'expense',date:p.date||today},today);
   next.checked_days??=[];if(!next.checked_days.includes(p.date||today))next.checked_days.push(p.date||today);
   return next;
  }
  const s=structuredClone(input);
  const find=(items,id)=>{const x=items.find(i=>i.id===id);if(!x)throw Error('Запись не найдена.');return x;};
  const amount=(v,zero=false)=>{if(!Number.isSafeInteger(v)||v<(zero?0:1)||v>100000000000)throw Error('Укажите корректную сумму.');return v;};
  const title=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>60)throw Error('Название должно содержать от 1 до 60 символов.');return v.trim();};
  const spent=()=>((s.opening?.month===s.month?s.opening.spent:0)||0)+s.transactions.filter(t=>t.kind==='expense'&&t.date.startsWith(s.month)).reduce((a,t)=>a+t.amount,0);
  const topup=()=>{
   // Cover overspending before the existing month/reserve distribution.
   let n=Math.min(s.free,Math.max(0,-s.balance));s.balance+=n;s.free-=n;
   n=Math.min(s.free,Math.max(0,s.budget-s.balance-spent()));s.balance+=n;s.free-=n;
   n=Math.min(s.free,Math.max(0,s.budget-s.reserve));s.reserve+=n;s.free-=n;
  };
  const record=(kind,value,extra={})=>s.transactions.push({id:newId(),kind,amount:value,date:p.date||today,...extra});
  switch(p.action){
    case 'onboarding': {
     if(s.onboarding_complete===true||s.transactions.length||s.categories.length||s.balance||s.reserve||s.free||s.goals.some(g=>g.saved||!g.reserve))throw Error('Начальная настройка уже выполнена. Измените данные в настройках.');
     const budget=amount(p.budget),total=amount(p.total,true),balance=amount(p.balance,true),alreadySpent=amount(p.spent,true),reserve=amount(p.reserve,true);
     if(balance>budget||balance+reserve>total||reserve>budget)throw Error('Проверьте сумму резерва и доступные деньги.');
     if(!Array.isArray(p.goals)||p.goals.length>100||!Array.isArray(p.categories)||p.categories.length>100)throw Error('Не больше 100 целей и категорий.');
     const goals=p.goals.map(g=>({id:newId(),name:title(g.name),target:amount(g.target),saved:amount(g.saved,true),reserve:!!g.reserve,icon:g.icon||'star'}));
     if(goals.filter(g=>g.reserve).length>1||goals.some(g=>g.reserve&&g.target!==budget))throw Error('Цель запаса должна соответствовать бюджету месяца.');
     const categories=p.categories.map(c=>({id:newId(),name:title(c.name),limit:c.limit===null?null:amount(c.limit,true),tags:[],icon:c.icon||'star'}));
     if(categories.reduce((a,c)=>a+(c.limit||0),0)>budget)throw Error('Сумма лимитов категорий превышает месячный бюджет.');
     Object.assign(s,{budget,balance,reserve,free:total-balance-reserve,goals,categories,opening:{month:s.month,spent:alreadySpent},onboarding_complete:true});break;
    }

    case 'income': {const before={balance:s.balance,reserve:s.reserve,free:s.free},n=amount(p.amount);s.free+=n;topup();record('income',n,s.manual_month_close?{funding:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,s[k]-v]))}:{});break;}
    case 'expense': {const n=amount(p.amount),c=find(s.categories,p.category);const tags=[...new Set(p.tags.map(title))];if(tags.length>10)throw Error('Выберите не больше десяти тегов.');c.tags=[...new Set([...c.tags,...tags])];s.balance-=n;record('expense',n,{category:c.id,category_name:c.name,tags});break;}
    case 'category': {const limit=p.limit===null?null:amount(p.limit,true),name=title(p.name);if(s.categories.filter(c=>c.id!==p.id).reduce((a,c)=>a+(c.limit||0),0)+(limit||0)>s.budget)throw Error('Сумма лимитов категорий превышает месячный бюджет.');if(p.id)Object.assign(find(s.categories,p.id),{name,limit,...(p.icon?{icon:p.icon}:{})});else s.categories.push({id:newId(),name,limit,tags:[],icon:p.icon||'star'});break;}
    case 'budget': {const n=amount(p.amount);if(s.categories.reduce((a,c)=>a+(c.limit||0),0)>n)throw Error('Сначала уменьшите лимиты категорий.');s.budget=n;for(const g of s.goals)if(g.reserve)g.target=n;const excess=Math.max(0,s.reserve-n);s.reserve-=excess;s.free+=excess;topup();break;}
    case 'goal': {const name=title(p.name),target=amount(p.target);if(p.id)Object.assign(find(s.goals,p.id),{name,target,...(p.icon?{icon:p.icon}:{})});else s.goals.push({id:newId(),name,target,saved:amount(p.saved||0,true),reserve:false,icon:p.icon||'star'});const g=p.id?find(s.goals,p.id):s.goals.at(-1);if('deadline' in p){if(p.deadline!==null&&(typeof p.deadline!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.deadline)||!Number.isFinite(Date.parse(p.deadline+'T12:00:00Z'))||new Date(p.deadline+'T12:00:00Z').toISOString().slice(0,10)!==p.deadline))throw Error('Укажите корректный срок.');g.deadline=p.deadline;}if('completed' in p){if(typeof p.completed!=='boolean'||(p.completed&&g.saved<g.target))throw Error('Сначала накопите нужную сумму.');g.completed=p.completed;}break;}
    case 'goal_order': {if(p.ids.length!==s.goals.length||new Set(p.ids).size!==s.goals.length)throw Error('Некорректный порядок целей.');s.goals=p.ids.map(id=>find(s.goals,id));break;}
    case 'allocate': {if(s.balance<0)throw Error('Сначала покройте перерасход текущего месяца.');if(!p.allocations||typeof p.allocations!=='object'||Array.isArray(p.allocations))throw Error('Некорректное распределение.');const entries=Object.entries(p.allocations),total=entries.reduce((a,[,v])=>a+amount(v,true),0);if(total>s.free)throw Error('Для распределения не хватает денег.');if(s.reserve<s.budget||s.balance+spent()<s.budget)throw Error('Сначала обеспечьте текущий и следующий месяц.');for(const [id,v]of entries){const g=find(s.goals,id);g.saved+=v;if(v)record('allocation',v,{goal_name:g.name,...(s.manual_month_close?{goal_id:g.id}:{})});}s.free-=total;break;}
    case 'goal_expense': {const g=find(s.goals,p.id),n=amount(p.amount);if(n>g.saved)throw Error('В этой цели недостаточно накоплений.');g.saved-=n;record('goal_expense',n,{goal_name:g.name,...(s.manual_month_close?{goal_id:g.id}:{})});break;}
    case 'appearance': s.appearance??={};for(const key of ['icons_only','budget_buttons'])if(key in p)s.appearance[key]=!!p[key];break;
    case 'reminders': s.reminders={daily:p.daily,day:p.day,enabled:p.enabled};break;
    default: throw Error('Неизвестное действие.');
  }
  return s;
 }
 function rollover(input,today){
  const s=structuredClone(input),month=today.slice(0,7);let changed=false;if(s.manual_month_close)return {state:s,changed:false};
  while(s.month<month){
   let [year,m]=s.month.split('-').map(Number);if(m===12){year++;m=1;}else m++;
   s.month=`${year}-${String(m).padStart(2,'0')}`;
   let excess=s.salary_version===2?0:Math.max(0,s.balance-s.budget);s.balance-=excess;s.free+=excess;
   let transfer=Math.min(s.reserve,Math.max(0,s.budget-s.balance));s.reserve-=transfer;s.balance+=transfer;
   transfer=Math.min(s.free,Math.max(0,s.budget-s.balance));s.free-=transfer;s.balance+=transfer;
   transfer=Math.min(s.free,Math.max(0,s.budget-s.reserve));s.free-=transfer;s.reserve+=transfer;
   changed=true;
  }
  return {state:s,changed};
 }
 function baseApply(input,p,today){if(window.KopitDesignRules?.handles(p.action))return window.KopitDesignRules.apply(input,p,today);if(input.manual_month_close&&input.month<today.slice(0,7)){if(!['allocate','goal','category','goal_order','appearance','reminders'].includes(p.action))throw Error('Сначала завершите предыдущий месяц.');const d=new Date(input.month+'-01T12:00:00');d.setMonth(d.getMonth()+1,0);today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}return apply(input,p,today);}
 function publicApply(input,p,today){
  const s=structuredClone(input),h=s.household||{members:[],actors:{},owners:{}};
  if(p.action==='household_member'){
   if(typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>60)throw Error('Имя должно содержать от 1 до 60 символов.');const name=p.name.trim(),id=p.id||newId();if(h.members.some(m=>m.id!==id&&m.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Участник с таким именем уже есть.');
   if(p.id){const m=h.members.find(m=>m.id===id);if(!m)throw Error('Участник не найден.');m.name=name;}else{if(h.members.length>=30)throw Error('Можно добавить до 30 участников.');h.members.push({id,name});}s.household=h;return s;
  }
  if(p.actor_id!==undefined&&!h.members.some(m=>m.id===p.actor_id))throw Error('Выберите участника в настройках.');
  if(p.owner_id!==undefined&&p.owner_id!==null&&!h.members.some(m=>m.id===p.owner_id))throw Error('Владелец цели не найден.');
  const q={...p};delete q.actor_id;delete q.owner_id;const r=baseApply(s,q,today);
  if(p.actor_id)for(const t of r.transactions)if(!input.transactions.some(old=>old.id===t.id))h.actors[t.id]=p.actor_id;
  if(p.owner_id!==undefined){const id=p.id||r.goals.at(-1).id;if(p.owner_id===null)delete h.owners[id];else h.owners[id]=p.owner_id;}
  if(input.household||p.actor_id||p.owner_id!==undefined)r.household=h;return r;
 }
 return {initial,apply:publicApply,rollover,upgrade};
})();
