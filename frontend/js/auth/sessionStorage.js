import {
  STORAGE_KEY,
  TOKEN_STORAGE_VERSION,
  TOKEN_TYPE_TOKEN,
} from "../config.js";

function canUseSessionStorage() {
  try {
    return Boolean(globalThis.sessionStorage);
  } catch (e) {
    return false;
  }
}

export function readStoredSession() {
  if (!canUseSessionStorage()) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const version = Number(parsed.version || 0);

    const normalizeTokenSession = (token, expiresAt = 0) => {
      const trimmedToken = typeof token === "string" ? token.trim() : "";
      if (!trimmedToken) {
        return null;
      }
      const normalizedExpiresAt = Number(expiresAt || 0);
      if (normalizedExpiresAt && Date.now() >= normalizedExpiresAt) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return {
        type: TOKEN_TYPE_TOKEN,
        token: trimmedToken,
        expiresAt: normalizedExpiresAt,
      };
    };

    if (version === 1) {
      return normalizeTokenSession(parsed.token, parsed.expiresAt);
    }

    if (version === TOKEN_STORAGE_VERSION) {
      return normalizeTokenSession(parsed.token, parsed.expiresAt);
    }

    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch (e) {
    console.warn("Не удалось прочитать сохранённую сессию из sessionStorage", e);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
    return null;
  }
}

export function persistSession(session) {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    if (!session) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    if (session.type === TOKEN_TYPE_TOKEN) {
      const token = typeof session.token === "string" ? session.token.trim() : "";
      if (!token) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload = {
        version: TOKEN_STORAGE_VERSION,
        type: TOKEN_TYPE_TOKEN,
        token,
        expiresAt: Number(session.expiresAt || 0),
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return;
    }

    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Не удалось сохранить сессию в sessionStorage", e);
  }
}
