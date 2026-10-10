// Demo keeps state only in this page's memory. It never calls the account API.
window.KOPIT_DEMO = new URLSearchParams(location.search).get('live') !== '1';
let demoState;
const demoId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
function demoInitial() {
  const today = dateKey();
  if(new URLSearchParams(location.search).get("setup")==="1")return KopitFinance.initial(today);
  return {
    onboarding_complete:true, month: today.slice(0, 7), budget: 17500000, balance: 14350000,
    reserve: 17500000, free: 2500000,
    categories: [
      {id:'housing', name:'Жильё', limit:6000000, tags:['Аренда','Коммунальные']},
      {id:'food', name:'Еда', limit:3500000, tags:['Продукты','Кафе']},
      {id:'car', name:'Машина', limit:2000000, tags:['Бензин','Парковка']},
      {id:'other', name:'Для себя', limit:null, tags:['Здоровье','Покупки']}
    ],
    goals: [
      {id:'reserve',name:'Ещё один месяц запаса',target:17500000,saved:4500000,reserve:true},
      {id:'vacation',name:'Отпуск',target:25000000,saved:8500000,reserve:false},
      {id:'laptop',name:'Новый ноутбук',target:18000000,saved:6000000,reserve:false}
    ],
    reminders:{daily:'21:00',day:1,enabled:false},
    transactions:[
      {id:'i1',kind:'income',amount:20000000,date:today},
      {id:'e1',kind:'expense',amount:2500000,date:today,category:'housing',category_name:'Жильё',tags:['Аренда']},
      {id:'e2',kind:'expense',amount:450000,date:today,category:'food',category_name:'Еда',tags:['Продукты']},
      {id:'e3',kind:'expense',amount:200000,date:today,category:'car',category_name:'Машина',tags:['Бензин']}
    ]
  };
}
function demoApi(path,p) {
  if (!demoState) demoState=demoInitial();
  if (path==='state') return {state:structuredClone(demoState),revision:0,email:'Демонстрация · без аккаунта'};
  if(path!=='action') throw Error('В деморежиме аккаунт не нужен.');
  if(p.action==='onboarding'){demoState=KopitFinance.apply(demoState,p,dateKey());return {state:structuredClone(demoState),revision:0,email:'Демонстрация · без аккаунта'};}
  if(p.action==='daily_expenses') {
    const backup=structuredClone(demoState);
    try {
      if(!Array.isArray(p.entries)||p.entries.length>100||p.date>dateKey()||p.date.slice(0,7)!==demoState.month)throw Error('Выберите день текущего месяца не позднее сегодня.');
      for(const entry of p.entries)demoApi('action',{...entry,action:'expense',date:p.date});
      demoState.checked_days??=[];
      if(!demoState.checked_days.includes(p.date))demoState.checked_days.push(p.date);
      return demoApi('state');
    }catch(e){demoState=backup;throw e;}
  }
  const s=structuredClone(demoState);
  const find=(items,id)=>{const x=items.find(i=>i.id===id);if(!x)throw Error('Запись не найдена.');return x;};
  const amount=(v,zero=false)=>{if(!Number.isSafeInteger(v)||v<(zero?0:1)||v>100000000000)throw Error('Укажите корректную сумму.');return v;};
  const title=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>60)throw Error('Название должно содержать от 1 до 60 символов.');return v.trim();};
  const spent=()=>((s.opening?.month===s.month?s.opening.spent:0)||0)+s.transactions.filter(t=>t.kind==='expense'&&t.date.startsWith(s.month)).reduce((a,t)=>a+t.amount,0);
  const topup=()=>{let n=Math.min(s.free,Math.max(0,s.budget-s.balance-spent()));s.balance+=n;s.free-=n;n=Math.min(s.free,Math.max(0,s.budget-s.reserve));s.reserve+=n;s.free-=n;};
  const record=(kind,value,extra={})=>s.transactions.push({id:demoId(),kind,amount:value,date:p.date||dateKey(),...extra});
  switch(p.action){
    case 'income': {const n=amount(p.amount);s.free+=n;topup();record('income',n);break;}
    case 'expense': {const n=amount(p.amount),c=find(s.categories,p.category);const tags=[...new Set(p.tags.map(title))];if(tags.length>10)throw Error('Выберите не больше десяти тегов.');c.tags=[...new Set([...c.tags,...tags])];s.balance-=n;record('expense',n,{category:c.id,category_name:c.name,tags});break;}
    case 'category': {const limit=p.limit===null?null:amount(p.limit,true),name=title(p.name);if(s.categories.filter(c=>c.id!==p.id).reduce((a,c)=>a+(c.limit||0),0)+(limit||0)>s.budget)throw Error('Сумма лимитов категорий превышает месячный бюджет.');if(p.id)Object.assign(find(s.categories,p.id),{name,limit,...(p.icon?{icon:p.icon}:{})});else s.categories.push({id:demoId(),name,limit,tags:[],icon:p.icon||'star'});break;}
    case 'budget': {const n=amount(p.amount);if(s.categories.reduce((a,c)=>a+(c.limit||0),0)>n)throw Error('Сначала уменьшите лимиты категорий.');s.budget=n;for(const g of s.goals)if(g.reserve)g.target=n;const excess=Math.max(0,s.reserve-n);s.reserve-=excess;s.free+=excess;topup();break;}
    case 'goal': {const name=title(p.name),target=amount(p.target);if(p.id)Object.assign(find(s.goals,p.id),{name,target,...(p.icon?{icon:p.icon}:{})});else s.goals.push({id:demoId(),name,target,saved:amount(p.saved||0,true),reserve:false,icon:p.icon||'star'});break;}
    case 'goal_order': {if(p.ids.length!==s.goals.length||new Set(p.ids).size!==s.goals.length)throw Error('Некорректный порядок целей.');s.goals=p.ids.map(id=>find(s.goals,id));break;}
    case 'allocate': {const entries=Object.entries(p.allocations),total=entries.reduce((a,[,v])=>a+amount(v,true),0);if(total>s.free)throw Error('Для распределения не хватает денег.');if(s.reserve<s.budget||s.balance+spent()<s.budget)throw Error('Сначала обеспечьте текущий и следующий месяц.');for(const [id,v]of entries){const g=find(s.goals,id);g.saved+=v;if(v)record('allocation',v,{goal_name:g.name});}s.free-=total;break;}
    case 'goal_expense': {const g=find(s.goals,p.id),n=amount(p.amount);if(n>g.saved)throw Error('В этой цели недостаточно накоплений.');g.saved-=n;record('goal_expense',n,{goal_name:g.name});break;}
    case 'appearance': s.appearance??={};for(const key of ['icons_only','budget_buttons'])if(key in p)s.appearance[key]=!!p[key];break;
    case 'reminders': s.reminders={daily:p.daily,day:p.day,enabled:p.enabled};break;
    default: throw Error('Неизвестное действие.');
  }
  demoState=s;
  return {state:structuredClone(s),revision:0,email:'Демонстрация · без аккаунта'};
}
