// Ask Play for fresh state on every user request. A cached availability flag
// must never send someone to the store or start a second download.
export function createAndroidAppUpdater({bridge, onState = () => {}, notify = () => {}, openStore = null}) {
  let pending = null;
  const complete = async () => {
    await bridge.complete();
    return {status:'installing'};
  };
  const fallback = async (status, message) => {
    if (openStore) {
      try { await openStore(); return {status:'store-fallback', reason:status}; } catch (_) {}
    }
    notify(message);
    return {status};
  };
  const run = async () => {
    try {
      const info = await bridge.checkForUpdate();
      onState({...info, checked:true, error:false});
      if (info.downloaded) return await complete();
      if (info.inProgress && !info.immediateInProgress) {
        notify('La actualización ya se está descargando. Podés seguir usando la aplicación.');
        return {status:'downloading'};
      }
      if (!info.available && !info.immediateInProgress) {
        notify('Ya tenés la última versión que Google Play ofrece para tu cuenta.');
        return {status:'current'};
      }
      const type = info.flexibleAllowed ? 'flexible' : info.immediateAllowed || info.immediateInProgress ? 'immediate' : '';
      if (!type) {
        return await fallback('unsupported', 'Google Play todavía no permite actualizar dentro de la aplicación. Volvé a intentarlo más tarde.');
      }
      const result = await bridge.start({type});
      if (result?.started) return {status:'started', type};
      // Play can finish a download or revoke availability between the two calls.
      if (result?.downloaded) return await complete();
      if (result?.inProgress) {
        notify('La actualización ya se está descargando. Podés seguir usando la aplicación.');
        return {status:'downloading'};
      }
      if (result?.available === false) {
        notify('Ya tenés la última versión que Google Play ofrece para tu cuenta.');
        return {status:'current'};
      }
      return await fallback('not-started', 'No se pudo iniciar la actualización dentro de la aplicación. Volvé a intentarlo.');
    } catch (_) {
      return await fallback('error', 'No se pudo completar la actualización dentro de la aplicación. Revisá la conexión y volvé a intentarlo.');
    }
  };
  return () => {
    if (!pending) pending = run().finally(() => {pending = null;});
    return pending;
  };
}
