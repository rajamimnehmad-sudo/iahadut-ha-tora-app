import {pushImageUrl} from './push-image.js';
export function alertExpired(item, now=Date.now()) {
  const expiry=item?.expiresAt || item?.data?.expiresAt;
  return Boolean(expiry && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry)<=now);
}
export function mergeInboxNotifications(existing, notices, revoked=[], dismissed=[]) {
  const rows=new Map(existing.map(item=>[item.eventKey || item.id,item]));
  for(const notice of notices) {
    if (!notice || !/^[a-f0-9-]{36}$/.test(notice.eventKey) || typeof notice.title!=='string' || typeof notice.body!=='string' || !Number.isFinite(Date.parse(notice.sentAt))) continue;
    if (alertExpired(notice)) { rows.delete(notice.eventKey); continue; }
    if (revoked.includes(notice.eventKey) || dismissed.includes(notice.eventKey)) continue;
    const previous=rows.get(notice.eventKey);
    rows.set(notice.eventKey,{...previous,id:previous?.id || notice.eventKey,eventKey:notice.eventKey,title:notice.title,body:notice.body,imageUrl:pushImageUrl(notice.imageUrl),sentAt:notice.sentAt,expiresAt:notice.expiresAt || '',time:new Date(notice.sentAt).toLocaleString('es-AR',{hour12:false}),url:previous?.url || ''});
  }
  return [...rows.values()].filter(item=>!alertExpired(item) && !revoked.includes(item.eventKey || item.id) && !dismissed.includes(item.eventKey || item.id)).sort((a,b)=>Date.parse(b.sentAt || '')-Date.parse(a.sentAt || '')).slice(0,100);
}
