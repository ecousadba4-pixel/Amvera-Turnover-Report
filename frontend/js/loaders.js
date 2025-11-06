import { requestWithDateFieldFallback } from "./api/dateField.js";
import { ensureAuthSession, getAuthorizationHeader } from "./auth/index.js";
import {
  abortSectionController,
  getSectionController,
  setLoadingState,
  setSectionController,
} from "./state.js";
import { getCacheKey, getCachedResponse, setCachedResponse } from "./cache.js";
import { handleAuthFailure } from "./appAuth.js";

export async function loadMetrics({
  section,
  endpoint,
  range,
  validateRange,
  includeDateField = true,
  onApply,
  onCacheHit,
  onSuccess,
  onAuthError,
  onError,
}) {
  if (!ensureAuthSession()) {
    return false;
  }

  const { from, to } = range;
  if (!validateRange(from, to)) {
    return false;
  }

  const cacheKey = getCacheKey(section, from, to);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    onApply(cached);
    if (typeof onCacheHit === "function") {
      onCacheHit(cached);
    }
    return true;
  }

  abortSectionController(section);

  const controller = new AbortController();
  setSectionController(section, controller);
  setLoadingState(true);

  try {
    const baseParams = new URLSearchParams();
    if (from) {
      baseParams.set("date_from", from);
    }
    if (to) {
      baseParams.set("date_to", to);
    }

    const data = await requestWithDateFieldFallback({
      path: `/api/${endpoint}`,
      baseParams,
      includeDateField,
      signal: controller.signal,
      headers: getAuthorizationHeader(),
    });
    onApply(data);
    setCachedResponse(cacheKey, data);
    if (typeof onSuccess === "function") {
      onSuccess(data);
    }
    return true;
  } catch (error) {
    if (error?.name === "AbortError") {
      return false;
    }
    if (error?.status === 401 || error?.status === 403) {
      handleAuthFailure("Неверный пароль или сессия истекла.");
      if (typeof onAuthError === "function") {
        onAuthError(error);
      }
      return false;
    }
    if (typeof onError === "function") {
      onError(error);
    } else {
      console.error(`Ошибка загрузки данных для ${section}`, error);
    }
    return false;
  } finally {
    if (getSectionController(section) === controller) {
      setSectionController(section, null);
      setLoadingState(false);
    }
  }
}
