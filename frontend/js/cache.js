import { DATE_FIELD, REQUEST_CACHE_MAX_ENTRIES, REQUEST_CACHE_TTL_MS } from "./config.js";

const requestCache = new Map();

export function getCachedResponse(key) {
  const entry = requestCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    requestCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedResponse(key, data) {
  const expiresAt = Date.now() + REQUEST_CACHE_TTL_MS;
  requestCache.set(key, { data, expiresAt });
  pruneCacheSize();
}

export function clearCache() {
  requestCache.clear();
}

function pruneCacheSize() {
  if (requestCache.size <= REQUEST_CACHE_MAX_ENTRIES) {
    return;
  }
  const sortedKeys = Array.from(requestCache.entries())
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    .map(([key]) => key);

  while (requestCache.size > REQUEST_CACHE_MAX_ENTRIES && sortedKeys.length) {
    const keyToDelete = sortedKeys.shift();
    requestCache.delete(keyToDelete);
  }
}

export function getCacheKey(section, from, to) {
  const fromSafe = from || "";
  const toSafe = to || "";
  return `${section}-${fromSafe}-${toSafe}-${DATE_FIELD}`;
}

export function getMonthlyCacheKey(metric, range) {
  return `monthly-${metric}-${range}-${DATE_FIELD}`;
}

export function getMonthlyServiceCacheKey(serviceType, range) {
  const normalized = encodeURIComponent((serviceType || "").toLowerCase());
  return `monthly-service-${normalized}-${range}-${DATE_FIELD}`;
}
