import { authenticate } from "./auth/index.js";
import { elements } from "./dom.js";
import { handleAuthSuccess } from "./appAuth.js";

export function bindPasswordForm({ fetchRevenue, fetchServices }) {
  elements.goBtn.addEventListener("click", async () => {
    const pwd = (elements.pwdInput.value || "").trim();
    if (!pwd) {
      elements.errBox.textContent = "Введите пароль";
      elements.pwdInput.focus();
      return;
    }

    elements.goBtn.disabled = true;
    elements.errBox.textContent = "";

    try {
      const session = await authenticate(pwd);
      await handleAuthSuccess(session, { fetchRevenue, fetchServices });
    } catch (error) {
      elements.errBox.textContent = `Ошибка авторизации: ${error.message}`;
    } finally {
      elements.goBtn.disabled = false;
    }
  });

  elements.pwdInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      elements.goBtn.click();
    }
  });
}
