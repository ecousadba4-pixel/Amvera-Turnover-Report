import { elements } from "../dom.js";

export function showError(message) {
  const { filterError } = elements;
  if (!filterError) {
    return;
  }
  filterError.textContent = message || "";
  filterError.hidden = !message;
}

export function clearError() {
  showError("");
}

export function formatLoadErrorMessage(error, baseText = "Ошибка загрузки данных") {
  const details = typeof error?.message === "string" ? error.message.trim() : "";
  return details ? `${baseText}: ${details}` : baseText;
}
