// No fetch handler, cache or financial data: authenticated pages remain network-only.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data;try{data=event.data.json();}catch{return;}
 if(!['daily','monthly'].includes(data.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(data.day))return;
 const body=data.kind==='daily'?'Как прошёл день? Запишите расходы и проверьте, на что потратили сегодня.':'Начался новый месяц. Завершите предыдущий и распределите свободные деньги по целям или в резерв.';
 event.waitUntil(self.registration.showNotification(data.kind==='daily'?'Копит · итоги дня':'Копит · новый месяц',{body,tag:'kopit-'+data.kind+'-'+data.day,renotify:false,icon:'./app-icon.png',data:{kind:data.kind}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const kind=event.notification.data?.kind;if(!['daily','monthly'].includes(kind))return;
 const target=new URL('./',self.registration.scope);target.searchParams.set('reminder',kind);
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=windows.find(c=>c.url.startsWith(self.registration.scope));if(client){await client.focus();client.postMessage({type:'kopit-reminder',kind});}else await self.clients.openWindow(target.href);})());
});
