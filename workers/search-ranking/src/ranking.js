export const DAILY_LIMIT = 5000;
export const USER_DAILY_LIMIT = 50;
export const dayAt = now => new Date(now).toISOString().slice(0,10);
export const cutoffAt = now => dayAt(now - 27 * 86400000);
export function validProduct(url) {
  return typeof url === 'string' && url.length <= 700 && /^https:\/\/vaad\.ar\/producto\/[a-zA-Z0-9%_-]+\/$/.test(url);
}
export async function hashUid(uid, day) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`iahadut-search:${day}:${uid}`));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}
// Limits, receipt and trigger counters are one atomic SQLite statement, including concurrent requests.
export const RECORD_SQL = `INSERT OR IGNORE INTO receipts(day,uid,url)
 SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM catalog WHERE url=?3 AND active=1)
 AND COALESCE((SELECT n FROM user_totals WHERE day=?1 AND uid=?2),0)<${USER_DAILY_LIMIT}
 AND COALESCE((SELECT n FROM day_totals WHERE day=?1),0)<${DAILY_LIMIT}
 RETURNING url`;
export async function record(db, uid, url, now = Date.now()) {
  if (!validProduct(url)) return {accepted:false,reason:'invalid-product'};
  const day = dayAt(now), identity = await hashUid(uid,day);
  const accepted = await db.prepare(RECORD_SQL).bind(day,identity,url).first();
  if (accepted) return {accepted:true};
  const duplicate = await db.prepare('SELECT 1 AS found FROM receipts WHERE day=? AND uid=? AND url=?').bind(day,identity,url).first();
  return {accepted:false,reason:duplicate ? 'duplicate' : 'limited-or-inactive'};
}
export async function rebuild(db, now = Date.now()) {
  const {results} = await db.prepare(`SELECT p.url,SUM(p.n) AS searches FROM product_totals p
    JOIN catalog c ON c.url=p.url AND c.active=1 WHERE p.day>=? AND p.day<=?
    GROUP BY p.url ORDER BY searches DESC,p.url ASC LIMIT 20`).bind(cutoffAt(now),dayAt(now)).all();
  const ranking = {schemaVersion:1,source:'app-search',metric:'catalog_product_search',windowDays:28,
    generatedAt:new Date(now).toISOString(),products:results.map(p=>({url:p.url,searches:Number(p.searches)}))};
  await db.batch([
    ...['receipts','user_totals','day_totals','product_totals'].map(table=>db.prepare(`DELETE FROM ${table} WHERE day<?`).bind(cutoffAt(now))),
    db.prepare("INSERT INTO state VALUES('ranking',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(ranking))
  ]);
  return ranking;
}
