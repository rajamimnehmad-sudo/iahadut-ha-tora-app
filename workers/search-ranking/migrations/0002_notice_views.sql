CREATE TABLE IF NOT EXISTS notice_views (
  event_key TEXT NOT NULL,
  viewer_hash TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (event_key, viewer_hash)
);
