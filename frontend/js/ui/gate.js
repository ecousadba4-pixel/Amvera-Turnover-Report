import { elements } from "../dom.js";
import { clearError } from "./errors.js";

export function updateGateError(message, { onlyWhenVisible = true } = {}) {
  const { gate, errBox } = elements;
  if (!errBox) {
    return;
  }
  if (onlyWhenVisible && gate && gate.style.display === "none") {
    return;
  }
  errBox.textContent = message;
}

export function showGate(message = "") {
  const { gate, pwdInput } = elements;
  if (gate) {
    gate.style.display = "flex";
  }
  updateGateError(message, { onlyWhenVisible: false });
  if (pwdInput) {
    setTimeout(() => pwdInput.focus(), 0);
  }
  clearError();
}

export function hideGate() {
  const { gate } = elements;
  if (gate) {
    gate.style.display = "none";
  }
  updateGateError("", { onlyWhenVisible: false });
}
