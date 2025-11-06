import { DEFAULT_API_BASE } from "../config.js";

function normalizeBase(url) {
  return url.replace(/\/+$/, "");
}

function resolveApiBase() {
  const override = typeof window.U4S_API_BASE === "string" ? window.U4S_API_BASE.trim() : "";
  if (override) {
    return normalizeBase(override);
  }

  if (DEFAULT_API_BASE) {
    return normalizeBase(DEFAULT_API_BASE);
  }

  const origin = window.location && window.location.origin;
  if (origin && origin !== "null" && origin !== "file://") {
    return normalizeBase(origin);
  }

  return "";
}

export const API_BASE = resolveApiBase();
const API_BASE_ERROR_MESSAGE = "Базовый URL API не сконфигурирован";

export function ensureApiBase() {
  if (API_BASE) {
    return API_BASE;
  }
  console.error(API_BASE_ERROR_MESSAGE);
  return "";
}

export function requireApiBase() {
  if (API_BASE) {
    return API_BASE;
  }
  throw new Error(API_BASE_ERROR_MESSAGE);
}
