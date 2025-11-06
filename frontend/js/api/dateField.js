import { DATE_FIELD, DATE_FIELD_ALIASES } from "../config.js";
import { buildHttpError, isDateFieldValidationError } from "./errors.js";
import { requireApiBase } from "./base.js";

const resolvedDateFieldOverrides = new Map();

export async function requestWithDateFieldFallback({
  path,
  baseParams,
  includeDateField = true,
  signal,
  headers,
}) {
  const baseUrl = requireApiBase();
  if (!includeDateField) {
    const params = cloneSearchParams(baseParams);
    const queryString = params.toString();
    const url = `${baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
    const resp = await fetch(url, { headers, signal });
    if (!resp.ok) {
      throw await buildHttpError(resp);
    }
    return await resp.json();
  }

  const dateField = DATE_FIELD;
  const candidates = getOrderedDateFieldCandidates(dateField);
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const params = cloneSearchParams(baseParams);
    if (candidate) {
      params.set("date_field", candidate);
    }
    const queryString = params.toString();
    const url = `${baseUrl}${path}${queryString ? `?${queryString}` : ""}`;

    let resp;
    try {
      resp = await fetch(url, { headers, signal });
    } catch (error) {
      throw error;
    }

    if (resp.status === 401 || resp.status === 403) {
      throw await buildHttpError(resp);
    }

    if (!resp.ok) {
      const error = await buildHttpError(resp);
      const hasNextCandidate = index < candidates.length - 1;
      if (hasNextCandidate && isDateFieldValidationError(error)) {
        lastError = error;
        console.warn(
          `Сервер отклонил параметр date_field="${candidate}" (${error.message}). Пробуем альтернативное значение.`,
        );
        continue;
      }
      throw error;
    }

    const data = await resp.json();
    rememberDateFieldOverride(dateField, candidate);
    return data;
  }

  throw lastError || new Error("Не удалось выполнить запрос");
}

function getOrderedDateFieldCandidates(field) {
  const override = resolvedDateFieldOverrides.get(field);
  const candidates = getDateFieldCandidates(field);
  if (!override || !candidates.includes(override)) {
    return candidates;
  }
  return [override, ...candidates.filter((candidate) => candidate !== override)];
}

function rememberDateFieldOverride(field, candidate) {
  if (!candidate || candidate === field) {
    resolvedDateFieldOverrides.delete(field);
    return;
  }
  resolvedDateFieldOverrides.set(field, candidate);
}

function getDateFieldCandidates(field) {
  const aliases = DATE_FIELD_ALIASES[field] || [];
  const values = [field, ...aliases];
  const unique = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      continue;
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }
  return unique.length ? unique : [field].filter(Boolean);
}

function cloneSearchParams(baseParams) {
  if (!baseParams) {
    return new URLSearchParams();
  }
  if (baseParams instanceof URLSearchParams) {
    return new URLSearchParams(baseParams);
  }
  const params = new URLSearchParams();
  Object.entries(baseParams).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    const strValue = String(value);
    if (!strValue) {
      return;
    }
    params.set(key, strValue);
  });
  return params;
}
