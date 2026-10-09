// Ask Play for fresh state on every user request. A cached availability flag
// must never send someone to the store or start a second download.
export function createAndroidAppUpdater({bridge, onState = () => {}, notify = () => {}}) {
  let pending = null;
  const complete = async () => {
    await bridge.complete();
    return {status:'installing'};
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
        notify('Google Play todavía no permite actualizar dentro de la aplicación. Volvé a intentarlo más tarde.');
        return {status:'unsupported'};
      }
      const result = await bridge.start({type});
      if (result?.started) return {status:'started', type};
      // Play can finish a download or revoke availability between the two calls.
      if (result?.downloaded) return await complete();
      if (result?.inProgress) {
        notify('La actualización ya se está descargando. Podés seguir usando la aplicación.');
        return {status:'downloading'};
      }
      notify(result?.available === false
        ? 'Ya tenés la última versión que Google Play ofrece para tu cuenta.'
        : 'No se pudo iniciar la actualización dentro de la aplicación. Volvé a intentarlo.');
      return {status:result?.available === false ? 'current' : 'not-started'};
    } catch (_) {
      notify('No se pudo completar la actualización dentro de la aplicación. Revisá la conexión y volvé a intentarlo.');
      return {status:'error'};
    }
  };
  return () => {
    if (!pending) pending = run().finally(() => {pending = null;});
    return pending;
  };
}
