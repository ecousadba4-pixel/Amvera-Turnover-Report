import { elements } from "../dom.js";
import { clearError } from "./errors.js";

export function showGate(message = "") {
  const { gate, errBox, pwdInput } = elements;
  if (gate) {
    gate.style.display = "flex";
  }
  if (errBox) {
    errBox.textContent = message;
  }
  if (pwdInput) {
    setTimeout(() => pwdInput.focus(), 0);
  }
  clearError();
}

export function hideGate() {
  const { gate, errBox } = elements;
  if (gate) {
    gate.style.display = "none";
  }
  if (errBox) {
    errBox.textContent = "";
  }
}
