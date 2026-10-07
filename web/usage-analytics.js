// Explicit schemas keep free text, credentials and device identifiers out of events.
const screens = ['homeView','searchView','detailView','savedView','alertsView','moreView','timelineView','categoryDirectoryView','readerView'];
const choice = values => value => values.includes(value) ? value : undefined;
const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 100000) : undefined;
const schema = {
  app_screen_view: {screen:choice(screens), previous_screen:choice(screens)},
  product_save: {screen:choice(screens), saved_count:count},
  product_unsave: {screen:choice(screens), saved_count:count},
  catalog_search: {query_length:count, result_count:count, region:choice(['all','argentina','uruguay'])},
  product_open: {source:choice(['search','scanner','saved','catalog']), retry:choice([0,1])},
  catalog_product_search: {product_key:value => /^[a-f0-9]{64}$/.test(value || '') ? value : undefined},
  product_share: {outcome:choice(['attempt','sheet_returned','copied','cancelled','error'])},
  scanner_open: {},
  scanner_result: {outcome:choice(['invalid','exact','multiple','identified','not_found','cancelled','error','permission_denied'])},
  catalog_filter: {kind:choice(['brand','category','region']), region:choice(['all','argentina','uruguay'])},
  offline_download: {outcome:choice(['start','ready','paused','error','wait_wifi','cancelled']), automatic:choice([0,1])},
  catalog_refresh: {outcome:choice(['attempt','finished','error'])},
  notification_setting: {outcome:choice(['request','active','denied','error','disabled','pending','prompt','prompt-with-rationale','unavailable'])},
  content_open: {kind:choice(['info','category','card','image'])},
  store_open: {purpose:choice(['rate','store','update'])},
  contact_open: {screen:choice(screens)},
};

export function usageEvent(name, params = {}) {
  if (!Object.hasOwn(schema, name)) return null;
  const safe = {analytics_schema:1};
  for (const [key, validate] of Object.entries(schema[name])) {
    const value = validate(params[key]);
    if (value !== undefined) safe[key] = value;
  }
  return {name, params:safe};
}

// Buffer only plugin startup, in memory. No retries, disk writes or extra backend.
export function createUsageAnalytics({enabled = true, maxPending = 40} = {}) {
  let sender = null;
  let pending = [];
  let lastScreen = null;
  const send = event => {
    try { Promise.resolve(sender(event)).catch(() => {}); } catch (_) {}
  };
  const track = (name, params) => {
    if (!enabled) return;
    const event = usageEvent(name, params);
    if (!event) return;
    if (sender) send(event);
    else if (pending.length < maxPending) pending.push(event);
  };
  return {
    track,
    screen(screen) {
      if (!screens.includes(screen) || screen === lastScreen) return;
      const previous_screen = lastScreen;
      lastScreen = screen;
      track('app_screen_view', {screen, previous_screen});
    },
    connect(logEvent) {
      sender = logEvent;
      const events = pending;
      pending = [];
      events.forEach(send);
    },
  };
}
