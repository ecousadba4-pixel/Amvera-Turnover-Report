import { subscribeToLoadingChanges } from "../state.js";

let currentState = false;

function applyLoadingClass(isActive) {
  if (currentState === isActive) {
    return;
  }
  currentState = isActive;
  document.body.classList.toggle("is-loading", isActive);
}

export function bindLoadingIndicator() {
  applyLoadingClass(false);
  subscribeToLoadingChanges(applyLoadingClass);
}
