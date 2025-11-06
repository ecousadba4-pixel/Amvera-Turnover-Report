import { ensureAuthSession } from "../auth/index.js";
import {
  abortSectionController,
  getSectionController,
  setSectionController,
  setLoadingState,
} from "../state.js";
import { getCachedResponse, setCachedResponse } from "../cache.js";
import { isAbortError, isAuthError } from "../api/errors.js";
import { logApiError } from "./apiError.js";

export async function runCachedRequest({
  section,
  cacheKey,
  fetcher,
  onData,
  onCacheHit,
  onFreshData,
  onAuthError,
  onError,
  useGlobalLoading = false,
  errorLabel,
}) {
  if (!ensureAuthSession()) {
    return false;
  }

  const cached = getCachedResponse(cacheKey);
  if (cached) {
    if (typeof onData === "function") {
      onData(cached, { cached: true });
    }
    if (typeof onCacheHit === "function") {
      onCacheHit(cached);
    }
    return true;
  }

  abortSectionController(section);

  const controller = new AbortController();
  setSectionController(section, controller);

  if (useGlobalLoading) {
    setLoadingState(true);
  }

  try {
    const data = await fetcher({ signal: controller.signal });
    setCachedResponse(cacheKey, data);
    if (typeof onData === "function") {
      onData(data, { cached: false });
    }
    if (typeof onFreshData === "function") {
      onFreshData(data);
    }
    return true;
  } catch (error) {
    if (isAbortError(error)) {
      return false;
    }
    if (isAuthError(error)) {
      if (typeof onAuthError === "function") {
        onAuthError(error);
      }
      return false;
    }
    if (typeof onError === "function") {
      onError(error);
    } else if (errorLabel) {
      logApiError(errorLabel, error);
    }
    return false;
  } finally {
    if (getSectionController(section) === controller) {
      setSectionController(section, null);
      if (useGlobalLoading) {
        setLoadingState(false);
      }
    }
  }
}
