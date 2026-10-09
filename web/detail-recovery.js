// Recovery uses the static central copy, without a full scrape or Firestore reads.
export function createDetailRecovery({online, sync, read, now = Date.now, cooldown = 60000}) {
  let pending = null;
  let attemptedAt = -Infinity;
  return async url => {
    if (!online()) throw new Error('Sin conexión para actualizar la ficha');
    if (!pending && now() - attemptedAt >= cooldown) {
      attemptedAt = now();
      pending = Promise.resolve().then(sync).finally(() => { pending = null; });
    }
    if (pending) await pending;
    const detail = read(url);
    if (detail?.textFormatVersion !== 1 || typeof detail.description !== 'string' || !Array.isArray(detail.images)) {
      throw new Error('La ficha todavía no está disponible en la copia central');
    }
    return detail;
  };
}
