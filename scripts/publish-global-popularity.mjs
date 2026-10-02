import {readFile, writeFile} from 'node:fs/promises';
import {rankingFromReport} from '../web/global-popularity.js';
const property = process.env.ANALYTICS_PROPERTY_ID;
const token = process.env.ANALYTICS_ACCESS_TOKEN;
if (!/^\d+$/.test(property || '') || !token) throw new Error('Falta acceso de lectura a Analytics');
const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
  method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, signal:AbortSignal.timeout(30000),
  body:JSON.stringify({dateRanges:[{startDate:'28daysAgo',endDate:'yesterday'}],dimensions:[{name:'customEvent:product_key'}],metrics:[{name:'eventCount'}],
    dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'catalog_product_search'}}},limit:10000,returnPropertyQuota:true})
});
if (!response.ok) { console.error(`Analytics HTTP ${response.status}: ${String((await response.json()).error?.message || 'Sin acceso').slice(0,500)}`); process.exit(1); }
const report = await response.json();
if (Number(report.rowCount || 0) > 10000 || report.metadata?.dataLossFromOtherRow) throw new Error('Informe truncado; se conserva el ranking anterior');
const catalog = JSON.parse(await readFile(new URL('../web/data/catalog.json',import.meta.url),'utf8'));
const ranking = await rankingFromReport(report,catalog.products);
await writeFile(new URL('../web/data/global-popularity.json',import.meta.url),JSON.stringify(ranking,null,2)+'\n');
console.log(`Ranking global: ${ranking.products.length} productos con búsquedas reales; últimos 28 días completos.`);
