// One-time initialization of the newly created isolated database; no private credentials in files.
import {mkdtemp,writeFile,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {syncCatalog} from '../src/index.js';
const statements=[];
const db={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return null;},async run(){
  let index=0; statements.push(sql.replace(/\?/g,()=>`'${String(values[index++]).replaceAll("'","''")}'`)+';');
}};},async batch(items){for(const item of items)await item.run();}};
await syncCatalog(db);
const initial={schemaVersion:1,source:'app-search',metric:'catalog_product_search',windowDays:28,generatedAt:new Date().toISOString(),products:[]};
statements.push(`INSERT INTO state VALUES('ranking','${JSON.stringify(initial)}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`);
const directory=await mkdtemp(join(tmpdir(),'iahadut-ranking-seed-'));
try {
  const file=join(directory,'seed.sql'); await writeFile(file,statements.join('\n'));
  execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','iahadut-search-ranking','--remote','--file',file,'--yes'],{stdio:'inherit'});
} finally {await rm(join(directory,'seed.sql'));await rmdir(directory);}
