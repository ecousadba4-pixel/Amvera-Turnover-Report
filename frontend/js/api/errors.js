export async function readResponseError(resp) {
  let text = "";
  try {
    text = await resp.text();
  } catch (err) {
    return { detail: null, message: `HTTP ${resp.status}` };
  }

  if (!text) {
    return { detail: null, message: `HTTP ${resp.status}` };
  }

  try {
    const payload = JSON.parse(text);
    const detail = payload?.detail ?? null;
    if (typeof detail === "string" && detail.trim()) {
      return { detail, message: detail };
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          const message = typeof item?.msg === "string" ? item.msg.trim() : "";
          if (message) {
            return message;
          }
          const itemDetail = typeof item?.detail === "string" ? item.detail.trim() : "";
          return itemDetail || null;
        })
        .filter(Boolean);
      if (messages.length) {
        return { detail, message: messages.join("; ") }; 
      }
    }
    if (detail && typeof detail === "object") {
      const values = Object.values(detail)
        .map((value) => (typeof value === "string" ? value.trim() : null))
        .filter(Boolean);
      if (values.length) {
        return { detail, message: values.join("; ") };
      }
    }
    return { detail, message: `HTTP ${resp.status}` };
  } catch (err) {
    return { detail: text, message: text };
  }
}

export async function buildHttpError(resp) {
  const { detail, message } = await readResponseError(resp);
  const statusMessage = `HTTP ${resp.status}`;
  const errorMessage =
    message && message !== statusMessage ? `${message} (${statusMessage})` : statusMessage;
  const error = new Error(errorMessage);
  error.status = resp.status;
  error.detail = detail;
  error.url = resp.url;
  return error;
}

export function isDateFieldValidationError(error) {
  if (!error || error.status !== 422) {
    return false;
  }
  const detail = error.detail;
  if (typeof detail === "string") {
    return detail.toLowerCase().includes("date_field");
  }
  if (Array.isArray(detail)) {
    return detail.some((item) => {
      if (Array.isArray(item?.loc) && item.loc.includes("date_field")) {
        return true;
      }
      const message = typeof item?.msg === "string" ? item.msg.toLowerCase() : "";
      return message.includes("date_field");
    });
  }
  if (detail && typeof detail === "object") {
    if (Object.prototype.hasOwnProperty.call(detail, "date_field")) {
      return true;
    }
    return Object.values(detail).some((value) => {
      if (typeof value === "string") {
        return value.toLowerCase().includes("date_field");
      }
      return false;
    });
  }
  return false;
}

export function isAuthError(error) {
  const status = error?.status;
  return status === 401 || status === 403;
}

export function isAbortError(error) {
  return error?.name === "AbortError";
}

