// Notification pictures must be public HTTPS raster images, never executable URLs.
export function pushImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
