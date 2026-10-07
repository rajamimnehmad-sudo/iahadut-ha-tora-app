export const LIVE_SEARCH_REFRESH_INTERVAL = 15 * 60 * 1000;
export const LIVE_SEARCH_ENDPOINT = 'https://iahadut-search-ranking.iahadut-search-ranking.workers.dev';
export function createLiveSearchTransport({getToken, fetcher = fetch, endpoint = LIVE_SEARCH_ENDPOINT}) {
  return async (name,data) => {
    const recording = name === 'recordCatalogSearch';
    if (!recording && name !== 'getCatalogSearchRanking') throw Error('Operación inválida');
    const headers = recording ? {'Content-Type':'application/json',Authorization:`Bearer ${await getToken()}`} : {};
    const response = await fetcher(`${endpoint}/${recording ? 'record' : 'ranking'}`,{
      method:recording ? 'POST' : 'GET',headers,body:recording ? JSON.stringify(data) : undefined,
      cache:'no-store',signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) throw Error('Ranking no disponible');
    return response.json();
  };
}

export function createLiveSearchClient({call, storage, clock = Date.now}) {
  const pending = new Set();
  const remembered = new Set();
  return {
    async record(productUrl) {
      const key = `${new Date(clock()).toISOString().slice(0,10)}:${productUrl}`;
      let persisted = false;
      try { persisted = storage?.getItem('iht_search_counted') === key; } catch (_) {}
      if (persisted || remembered.has(key) || pending.has(key)) return false;
      pending.add(key);
      try {
        const result = await call('recordCatalogSearch', {productUrl});
        if (result?.accepted || result?.reason === 'duplicate') {
          remembered.add(key);
          try { storage?.setItem('iht_search_counted', key); } catch (_) {}
        }
        return Boolean(result?.accepted);
      } finally { pending.delete(key); }
    },
    ranking: () => call('getCatalogSearchRanking', {})
  };
}
