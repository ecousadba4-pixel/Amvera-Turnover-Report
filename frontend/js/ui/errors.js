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
