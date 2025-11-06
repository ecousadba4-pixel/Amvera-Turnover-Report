import {
  TOKEN_TYPE_HASH,
  TOKEN_TYPE_TOKEN,
} from "../config.js";
import { requireApiBase } from "../api/base.js";
import { isLikelyNetworkError } from "../api/errors.js";
import { state, setAuthSession, clearAuthSession } from "../state.js";
import { persistSession, readStoredSession } from "./sessionStorage.js";

export { persistSession, readStoredSession };

export function hasValidAuthSession() {
  const session = state.authSession;
  if (!session) {
    return false;
  }
  if (session.type === TOKEN_TYPE_HASH) {
    return Boolean(session.hash);
  }
  if (session.type === TOKEN_TYPE_TOKEN) {
    if (!session.token) {
      return false;
    }
    if (session.expiresAt && Date.now() >= session.expiresAt) {
      return false;
    }
    return true;
  }
  return false;
}

export function ensureAuthSession() {
  const session = state.authSession;
  if (!session) {
    return false;
  }
  if (session.type === TOKEN_TYPE_HASH) {
    return Boolean(session.hash);
  }
  if (session.expiresAt && Date.now() >= session.expiresAt) {
    return false;
  }
  return Boolean(session.token);
}

export function getAuthorizationHeader() {
  const session = state.authSession;
  if (!hasValidAuthSession()) {
    return {};
  }
  if (session.type === TOKEN_TYPE_HASH) {
    return { "X-Auth-Hash": session.hash };
  }
  return { Authorization: `Bearer ${session.token}` };
}

export function updateAuthSession(session) {
  if (!session) {
    clearAuthSession();
    return;
  }
  if (session.type === TOKEN_TYPE_HASH) {
    const hash = typeof session.hash === "string" ? session.hash.trim().toLowerCase() : "";
    setAuthSession(hash ? { type: TOKEN_TYPE_HASH, hash } : null);
    return;
  }
  if (session.type === TOKEN_TYPE_TOKEN) {
    const token = typeof session.token === "string" ? session.token.trim() : "";
    if (!token) {
      clearAuthSession();
      return;
    }
    setAuthSession({
      type: TOKEN_TYPE_TOKEN,
      token,
      expiresAt: Number(session.expiresAt || 0),
    });
    return;
  }
  clearAuthSession();
}

export async function authenticate(password) {
  const baseUrl = requireApiBase();

  try {
    const resp = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error("Неверный пароль");
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const token = typeof data.access_token === "string" ? data.access_token.trim() : "";
    if (!token) {
      throw new Error("Токен авторизации не получен");
    }
    const expiresInSeconds = Number(data.expires_in || 0);
    const expiresAt = expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : 0;
    return { type: TOKEN_TYPE_TOKEN, token, expiresAt };
  } catch (error) {
    if (isLikelyNetworkError(error)) {
      try {
        const hash = await sha256Hex(password);
        if (!hash) {
          throw new Error("empty hash");
        }
        return { type: TOKEN_TYPE_HASH, hash };
      } catch (hashError) {
        console.error("Не удалось вычислить SHA-256 пароля", hashError);
      }
    }
    throw error;
  }
}

async function sha256Hex(value) {
  if (!value) {
    return "";
  }
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error("Хеширование недоступно в этом браузере");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
