export const validNoticeKey = key => typeof key === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key);
export async function recordNoticeView(db, uid, eventKey, now = Date.now()) {
  if (!validNoticeKey(eventKey)) return {accepted:false,reason:'invalid'};
  const bytes = new TextEncoder().encode(`notice-view:${eventKey}:${uid}`);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const result=await db.prepare('INSERT OR IGNORE INTO notice_views(event_key,viewer_hash,seen_at) VALUES(?,?,?)').bind(eventKey,hash,now).run();
  return {accepted:Boolean(result.meta?.changes),reason:result.meta?.changes?'recorded':'duplicate'};
}
export async function noticeCounts(db, keys) {
  if(!Array.isArray(keys)||keys.length>100||!keys.every(validNoticeKey)) throw Error('Invalid notice keys');
  const counts={};
  for(const key of new Set(keys)) {
    const row=await db.prepare('SELECT COUNT(*) AS views FROM notice_views WHERE event_key=?').bind(key).first();
    counts[key]=Number(row?.views)||0;
  }
  return {counts,metric:'unique_installations_visible',since:'2026-10-09'};
}
