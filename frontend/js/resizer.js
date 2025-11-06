import { HEIGHT_UPDATE_DEBOUNCE_MS } from "./config.js";
import { elements } from "./dom.js";

let heightUpdateTimerId = null;

export function sendHeight() {
  try {
    const height = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: "resize", height }, "*");
  } catch (err) {
    console.warn("Resize postMessage failed:", err);
  }
}

export function scheduleHeightUpdate() {
  if (heightUpdateTimerId !== null) {
    clearTimeout(heightUpdateTimerId);
  }
  heightUpdateTimerId = window.setTimeout(() => {
    heightUpdateTimerId = null;
    sendHeight();
  }, HEIGHT_UPDATE_DEBOUNCE_MS);
}

export function setupHeightAutoResize() {
  window.addEventListener("load", scheduleHeightUpdate);
  window.addEventListener("resize", scheduleHeightUpdate);

  const heightObserverTarget = elements.dashboard || document.body;

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(() => {
      scheduleHeightUpdate();
    });
    if (heightObserverTarget) {
      resizeObserver.observe(heightObserverTarget);
    }
  } else if (heightObserverTarget) {
    new MutationObserver(scheduleHeightUpdate).observe(heightObserverTarget, {
      childList: true,
      subtree: true,
    });
  }

  setTimeout(sendHeight, 1000);
}
