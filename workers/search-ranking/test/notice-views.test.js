import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {recordNoticeView,noticeCounts} from '../src/notice-views.js';
test('A notice counts each authenticated installation once and stores no raw UID',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0002_notice_views.sql',import.meta.url),'utf8'));
 const db={prepare:query=>{let args=[];return {bind(...v){args=v;return this;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},async first(){return sql.prepare(query).get(...args);}};}};
 const key='12345678-1234-1234-1234-123456789abc';
 assert.equal((await recordNoticeView(db,'phone-a',key)).accepted,true);
 assert.equal((await recordNoticeView(db,'phone-a',key)).reason,'duplicate');
 await recordNoticeView(db,'phone-b',key);assert.equal((await noticeCounts(db,[key])).counts[key],2);
 assert.equal(sql.prepare('SELECT viewer_hash FROM notice_views').get().viewer_hash.length,64);
 assert.equal((await recordNoticeView(db,'phone-a','invalid')).accepted,false);
});
