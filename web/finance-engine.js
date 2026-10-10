// Shared deterministic finance operations; amounts are integer kopecks.
window.KopitFinance=(()=>{
 const newId=()=>crypto.randomUUID();
 function initial(today){return {month:today.slice(0,7),onboarding_complete:false,budget:17500000,balance:0,reserve:0,free:0,categories:[],transactions:[],checked_days:[],goals:[{id:newId(),name:'Ещё один месяц запаса',target:17500000,saved:0,reserve:true,icon:'reserve'}],reminders:{daily:'21:00',day:1,enabled:false},appearance:{icons_only:false}};}
 function apply(input,p,today){
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
  const topup=()=>{let n=Math.min(s.free,Math.max(0,s.budget-s.balance-spent()));s.balance+=n;s.free-=n;n=Math.min(s.free,Math.max(0,s.budget-s.reserve));s.reserve+=n;s.free-=n;};
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

    case 'income': {const n=amount(p.amount);s.free+=n;topup();record('income',n);break;}
    case 'expense': {const n=amount(p.amount),c=find(s.categories,p.category);const tags=[...new Set(p.tags.map(title))];if(tags.length>10)throw Error('Выберите не больше десяти тегов.');c.tags=[...new Set([...c.tags,...tags])];s.balance-=n;record('expense',n,{category:c.id,category_name:c.name,tags});break;}
    case 'category': {const limit=p.limit===null?null:amount(p.limit,true),name=title(p.name);if(s.categories.filter(c=>c.id!==p.id).reduce((a,c)=>a+(c.limit||0),0)+(limit||0)>s.budget)throw Error('Сумма лимитов категорий превышает месячный бюджет.');if(p.id)Object.assign(find(s.categories,p.id),{name,limit,...(p.icon?{icon:p.icon}:{})});else s.categories.push({id:newId(),name,limit,tags:[],icon:p.icon||'star'});break;}
    case 'budget': {const n=amount(p.amount);if(s.categories.reduce((a,c)=>a+(c.limit||0),0)>n)throw Error('Сначала уменьшите лимиты категорий.');s.budget=n;for(const g of s.goals)if(g.reserve)g.target=n;const excess=Math.max(0,s.reserve-n);s.reserve-=excess;s.free+=excess;topup();break;}
    case 'goal': {const name=title(p.name),target=amount(p.target);if(p.id)Object.assign(find(s.goals,p.id),{name,target,...(p.icon?{icon:p.icon}:{})});else s.goals.push({id:newId(),name,target,saved:amount(p.saved||0,true),reserve:false,icon:p.icon||'star'});break;}
    case 'goal_order': {if(p.ids.length!==s.goals.length||new Set(p.ids).size!==s.goals.length)throw Error('Некорректный порядок целей.');s.goals=p.ids.map(id=>find(s.goals,id));break;}
    case 'allocate': {const entries=Object.entries(p.allocations),total=entries.reduce((a,[,v])=>a+amount(v,true),0);if(total>s.free)throw Error('Для распределения не хватает денег.');if(s.reserve<s.budget||s.balance+spent()<s.budget)throw Error('Сначала обеспечьте текущий и следующий месяц.');for(const [id,v]of entries){const g=find(s.goals,id);g.saved+=v;if(v)record('allocation',v,{goal_name:g.name});}s.free-=total;break;}
    case 'goal_expense': {const g=find(s.goals,p.id),n=amount(p.amount);if(n>g.saved)throw Error('В этой цели недостаточно накоплений.');g.saved-=n;record('goal_expense',n,{goal_name:g.name});break;}
    case 'appearance': s.appearance??={};for(const key of ['icons_only','budget_buttons'])if(key in p)s.appearance[key]=!!p[key];break;
    case 'reminders': s.reminders={daily:p.daily,day:p.day,enabled:p.enabled};break;
    default: throw Error('Неизвестное действие.');
  }
  return s;
 }
 function rollover(input,today){
  const s=structuredClone(input),month=today.slice(0,7);let changed=false;
  while(s.month<month){
   let [year,m]=s.month.split('-').map(Number);if(m===12){year++;m=1;}else m++;
   s.month=`${year}-${String(m).padStart(2,'0')}`;
   let excess=Math.max(0,s.balance-s.budget);s.balance-=excess;s.free+=excess;
   let transfer=Math.min(s.reserve,Math.max(0,s.budget-s.balance));s.reserve-=transfer;s.balance+=transfer;
   transfer=Math.min(s.free,Math.max(0,s.budget-s.balance));s.free-=transfer;s.balance+=transfer;
   transfer=Math.min(s.free,Math.max(0,s.budget-s.reserve));s.free-=transfer;s.reserve+=transfer;
   changed=true;
  }
  return {state:s,changed};
 }
 return {initial,apply,rollover};
})();
