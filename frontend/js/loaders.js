import { requestWithDateFieldFallback } from "./api/dateField.js";
import { getAuthorizationHeader } from "./auth/index.js";
import { getCacheKey } from "./cache.js";
import { handleAuthFailure } from "./appAuth.js";
import { runCachedRequest } from "./utils/cachedRequest.js";
import { logApiError } from "./utils/apiError.js";

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
  const { from, to } = range;
  if (!validateRange(from, to)) {
    return false;
  }

  const cacheKey = getCacheKey(section, from, to);
  const fetcher = ({ signal }) => {
    const baseParams = new URLSearchParams();
    if (from) {
      baseParams.set("date_from", from);
    }
    if (to) {
      baseParams.set("date_to", to);
    }

    return requestWithDateFieldFallback({
      path: `/api/${endpoint}`,
      baseParams,
      includeDateField,
      signal,
      headers: getAuthorizationHeader(),
    });
  };

  return runCachedRequest({
    section,
    cacheKey,
    fetcher,
    onData: onApply,
    onCacheHit,
    onFreshData: onSuccess,
    onAuthError: (error) => {
      handleAuthFailure("Неверный пароль или сессия истекла.");
      if (typeof onAuthError === "function") {
        onAuthError(error);
      }
    },
    onError: (error) => {
      if (typeof onError === "function") {
        onError(error);
      } else {
        logApiError(`Ошибка загрузки данных для ${section}`, error);
      }
    },
    useGlobalLoading: true,
    errorLabel: `Ошибка загрузки данных для ${section}`,
  });
}
