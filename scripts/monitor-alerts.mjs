import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {DOMParser} from 'linkedom';

const sourceUrl = 'https://vaad.ar/alertas-de-productos/';
const statePath = resolve(process.env.ALERT_STATE_PATH || 'automation/alert-state.json');
const productTypes = new Set(['alta', 'baja']);
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const absolute = (value) => value ? new URL(value, sourceUrl).href : '';

const response = await fetch(sourceUrl, {headers: {Accept: 'text/html'}});
if (!response.ok) throw new Error(`No se pudo consultar la fuente oficial: HTTP ${response.status}`);
const document = new DOMParser().parseFromString(await response.text(), 'text/html');
const extract = (selector, type) => [...(document.querySelector(selector)?.querySelectorAll('li') || [])]
  .map((node) => ({type, text: clean(node.textContent), url: absolute(node.querySelector('a[href]')?.getAttribute('href'))}))
  .filter((item, index, all) => item.text.length > 8 && all.findIndex((candidate) => candidate.text === item.text) === index);
const current = [...extract('.card-altas', 'alta'), ...extract('.card-bajas', 'baja')];
const trackedSections = [
  {type: 'notes', title: 'Nueva nota de Kashrut', url: 'https://vaad.ar/notas-kashrut/'},
  {type: 'catering', title: 'Nuevo catering certificado', url: 'https://vaad.ar/servicios-de-catering/'}
];
for (const section of trackedSections) {
  const sectionResponse = await fetch(section.url, {headers: {Accept: 'text/html'}});
  if (!sectionResponse.ok) throw new Error(`No se pudo consultar ${section.type}: HTTP ${sectionResponse.status}`);
  const sectionDocument = new DOMParser().parseFromString(await sectionResponse.text(), 'text/html');
  const sectionText = [...sectionDocument.querySelectorAll('h1,h2,h3,h4,article,.et_pb_blurb,.info-card')]
    .map((node) => clean(node.textContent)).filter((text) => text.length > 2).join('|');
  const digest = createHash('sha256').update(sectionText).digest('hex');
  current.push({type: section.type, text: `${section.title} (${digest.slice(0, 12)})`, url: section.url, digest});
}
const currentMap = Object.fromEntries(current.map((item) => [`${item.type}:${item.text}`, item]));
let previous = {};
try {
  const parsed = JSON.parse(await readFile(statePath, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) previous = parsed;
} catch (_) {}
const previousEntries = Object.fromEntries(Object.entries(previous).filter(([key, item]) => key && item && typeof item === 'object' && typeof item.type === 'string'));
const previousProductCount = Object.values(previousEntries).filter((item) => productTypes.has(item.type)).length;
const currentProductCount = current.filter((item) => productTypes.has(item.type)).length;
const hasProductBaseline = previousProductCount > 0;
const hasSectionBaseline = trackedSections.some((section) => Object.values(previousEntries).some((item) => item?.type === section.type));
const needsProductBaseline = currentProductCount > 0 && !hasProductBaseline;
const changes = current.filter((item) => {
  const key = `${item.type}:${item.text}`;
  if (previousEntries[key]) return false;
  if (productTypes.has(item.type)) return hasProductBaseline;
  return hasSectionBaseline || !trackedSections.some((section) => section.type === item.type);
});
const mergedState = () => ({...previousEntries, ...currentMap});
const persistState = async (state = mergedState()) => {
  await mkdir(dirname(statePath), {recursive: true});
  const temporaryPath = `${statePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, statePath);
};

if (!changes.length) {
  await persistState();
  if (needsProductBaseline) console.log(`Se incorporó una línea de base segura para ${currentProductCount} productos sin enviar históricos.`);
  console.log('Sin cambios nuevos en altas, bajas o secciones informativas.');
  process.exit(0);
}

await persistState();
console.log(`${changes.length} cambio(s) registrados. El catálogo nunca envía push; usar el envío manual.`);
