import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function revokeNotification(document, id) {
  id = String(id || '').trim();
  if (!id || id.length > 512 || /[\r\n]/.test(id)) throw new Error('Indicá el identificador del aviso que querés retirar.');
  if (!Array.isArray(document.revoked)) throw new Error('El registro de avisos retirados no es válido.');
  return {...document, revoked:[...new Set([...document.revoked, id])]};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.MANUAL_PUSH_APPROVED !== '1') throw new Error('La retirada requiere una ejecución manual explícita.');
  const file = new URL('../web/data/push-revocations.json', import.meta.url);
  const document = revokeNotification(JSON.parse(await readFile(file, 'utf8')), process.env.PUSH_EVENT_KEY);
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Aviso retirado: ${process.env.PUSH_EVENT_KEY}. Se ocultará cuando la app consulte el registro con conexión.`);
}
