import { DATE_FIELD, REQUEST_CACHE_MAX_ENTRIES, REQUEST_CACHE_TTL_MS } from "./config.js";

/** @type {Map<string, { data: unknown, expiresAt: number }>} */
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
  promoteEntry(key, entry);
  return entry.data;
}

export function setCachedResponse(key, data) {
  const expiresAt = Date.now() + REQUEST_CACHE_TTL_MS;
  const entry = { data, expiresAt };
  promoteEntry(key, entry);
  removeExpiredEntries();
  enforceCacheLimit();
}

export function clearCache() {
  requestCache.clear();
}

function promoteEntry(key, entry) {
  if (requestCache.has(key)) {
    requestCache.delete(key);
  }
  requestCache.set(key, entry);
}

function removeExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of requestCache.entries()) {
    if (entry.expiresAt < now) {
      requestCache.delete(key);
    }
  }
}

function enforceCacheLimit() {
  while (requestCache.size > REQUEST_CACHE_MAX_ENTRIES) {
    const oldestKey = requestCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    requestCache.delete(oldestKey);
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
