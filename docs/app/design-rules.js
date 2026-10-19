// Approved interactions over the existing salary engine, amounts in kopecks.
window.KopitDesignRules=(()=>{
 const actions=new Set(['category_archive','close_month','closing_reserve','goal_balance','goal_update','transaction_edit','transaction_delete','transaction_restore']);
 const amount=n=>{if(!Number.isSafeInteger(n)||n<0||n>100000000000)throw Error('Укажите корректную сумму.');return n;};
 const find=(items,id)=>{const x=items.find(x=>x.id===id);if(!x)throw Error('Запись не найдена.');return x;};
 function preview(s){let balance=s.balance,reserve=s.reserve,free=s.free;const transfer=Math.min(reserve,Math.max(0,s.budget-balance));reserve-=transfer;balance+=transfer;let n=Math.min(free,Math.max(0,s.budget-balance));free-=n;balance+=n;n=Math.min(free,Math.max(0,s.budget-reserve));free-=n;reserve+=n;const d=new Date(s.month+'-01T12:00:00');d.setMonth(d.getMonth()+1);return {from_month:s.month,to_month:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,carry:s.balance,reserve_transfer:transfer,next_balance:balance,next_reserve:reserve,next_free:free,shortfall:Math.max(0,s.budget-balance),income:s.transactions.filter(t=>t.kind==='income'&&t.date.startsWith(s.month)).reduce((n,t)=>n+t.amount,0)};}
 function apply(input,p,today){const s=structuredClone(input),id=()=>crypto.randomUUID();
 if(p.action==='category_archive'){if(typeof p.archived!=='boolean')throw Error('Проверьте состояние категории.');find(s.categories,p.id).archived=p.archived;
 }else if(p.action==='close_month'){
  if(s.month>=today.slice(0,7))throw Error('Месяц ещё не завершён.');if(s.free)throw Error('Сначала распределите свободные деньги.');const q=preview(s);Object.assign(s,{month:q.to_month,balance:q.next_balance,reserve:q.next_reserve,free:q.next_free});(s.closing_audit??=[]).push({...q,date:today});
 }else if(p.action==='closing_reserve'){
  if(s.month>=today.slice(0,7)||s.free<=0)throw Error('Нет свободных денег для завершения месяца.');s.reserve+=s.free;s.transactions.push({id:id(),kind:'allocation',amount:s.free,date:s.month+'-01',goal_name:'Резерв будущих зарплат',reserve_transfer:true});s.free=0;
 }else if(['goal_balance','goal_update'].includes(p.action)){
  if(p.confirmed!==true)throw Error('Подтвердите корректировку фактических накоплений.');
  if(p.action==='goal_update'){const {saved,confirmed,...q}=p;const next=window.KopitFinance.apply(s,{...q,action:'goal'},today);Object.assign(s,next);}
  const g=find(s.goals,p.id),before=g.saved;g.saved=amount(p.saved);(s.goal_adjustments??=[]).push({id:id(),goal_id:g.id,before,after:g.saved,date:today});
 }else if(['transaction_edit','transaction_delete'].includes(p.action)){
  const t=find(s.transactions,p.id);if(!t.date.startsWith(s.month))throw Error('Закрытый месяц доступен только для просмотра.');
  if(t.kind==='expense')s.balance+=t.amount;
  else if(t.kind==='income'){
   if(!t.funding)throw Error('Для старого дохода нужна отдельная сверка распределения.');
   for(const [k,v] of Object.entries(t.funding)){if((k!=='balance'||v>0)&&s[k]-v<0)throw Error('Доход уже использован. Нельзя списывать накопления целей.');s[k]-=v;}
  }else throw Error('Эта операция исправляется в цели.');
  s.transactions=s.transactions.filter(x=>x.id!==t.id);
  if(p.action==='transaction_edit'){
   const {id:oldId,...q}=p;if(typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||p.date>today||p.date.slice(0,7)!==s.month||!Number.isFinite(Date.parse(p.date+'T12:00:00Z'))||new Date(p.date+'T12:00:00Z').toISOString().slice(0,10)!==p.date)throw Error('Выберите корректную дату текущего месяца.');
   Object.assign(s,window.KopitFinance.apply(s,{...q,action:t.kind},today));s.transactions.at(-1).id=t.id;s.transactions.at(-1).date=p.date;
  }
  (s.transaction_audit??=[]).push({id:id(),kind:p.action,transaction:t,date:today,restored:false});
 }else if(p.action==='transaction_restore'){
  const e=find(s.transaction_audit||[],p.audit_id),t=e.transaction;if(e.kind!=='transaction_delete'||e.restored||s.transactions.some(x=>x.id===t.id))throw Error('Удаление уже отменено.');if(!t.date.startsWith(s.month))throw Error('Закрытый месяц доступен только для просмотра.');
  if(t.kind==='expense')s.balance-=t.amount;else for(const [k,v] of Object.entries(t.funding))s[k]+=v;s.transactions.push(structuredClone(t));e.restored=true;
 }
 const values=[s.balance,s.reserve,s.free,...s.goals.map(g=>g.saved)];if(values.some(n=>!Number.isSafeInteger(n))||s.reserve<0||s.free<0||s.goals.some(g=>g.saved<0)||!Number.isSafeInteger(values.reduce((a,n)=>a+n,0)))throw Error('Сумма выходит за безопасный диапазон.');return s;
 }
 return {handles:action=>actions.has(action),apply,preview};
})();
