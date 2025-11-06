export function formatApiErrorMessage(error, prefix = "Ошибка загрузки данных") {
  const message = error && typeof error.message === "string" ? error.message.trim() : "";
  if (!message) {
    return prefix;
  }
  return `${prefix}: ${message}`;
}

export function logApiError(context, error, logger = console.error) {
  if (typeof logger !== "function") {
    return;
  }
  if (context) {
    logger(context, error);
  } else {
    logger("Ошибка API", error);
  }
}
