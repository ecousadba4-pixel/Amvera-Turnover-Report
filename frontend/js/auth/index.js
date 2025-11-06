import { TOKEN_TYPE_TOKEN } from "../config.js";
import { requireApiBase } from "../api/base.js";
import { state, setAuthSession, clearAuthSession } from "../state.js";
import { persistSession, readStoredSession } from "./sessionStorage.js";

export { persistSession, readStoredSession };

export function hasValidAuthSession() {
  const session = state.authSession;
  if (!session || session.type !== TOKEN_TYPE_TOKEN) {
    return false;
  }
  if (!session.token) {
    return false;
  }
  if (session.expiresAt && Date.now() >= session.expiresAt) {
    return false;
  }
  return true;
}

export function ensureAuthSession() {
  const session = state.authSession;
  if (!session || session.type !== TOKEN_TYPE_TOKEN) {
    return false;
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
  return { Authorization: `Bearer ${session.token}` };
}

export function updateAuthSession(session) {
  if (!session) {
    clearAuthSession();
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
}
