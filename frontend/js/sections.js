import { SECTION_REVENUE, SECTION_SERVICES } from "./config.js";
import { elements, sectionButtons } from "./dom.js";
import { hasValidAuthSession } from "./auth/index.js";
import { state } from "./state.js";
import { fetchServicesMetrics } from "./services.js";
import { resetMonthlyDetails } from "./monthly.js";

export function applySection(section) {
  const isRevenue = section === SECTION_REVENUE;
  if (elements.filterTitle) {
    elements.filterTitle.textContent = "Дата выезда";
  }
  setActiveSectionButton(section);
  elements.revenueSection.classList.toggle("hidden", !isRevenue);
  elements.servicesSection.classList.toggle("hidden", isRevenue);
  elements.revenueSection.setAttribute("aria-hidden", (!isRevenue).toString());
  elements.servicesSection.setAttribute("aria-hidden", isRevenue.toString());
  if (elements.dashboard) {
    elements.dashboard.classList.toggle("dashboard--single", isRevenue);
  }

  if (!isRevenue) {
    resetMonthlyDetails();
  }

  if (
    !isRevenue &&
    hasValidAuthSession() &&
    state.servicesDirty &&
    !state.controllers?.[SECTION_SERVICES] &&
    state.servicesFetchTimer === null
  ) {
    fetchServicesMetrics();
  }
}

export function bindSectionSwitch() {
  sectionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.sectionTarget;
      if (!section || section === state.activeSection) {
        return;
      }
      state.activeSection = section;
      applySection(section);
    });
  });
}

function setActiveSectionButton(section) {
  sectionButtons.forEach((btn) => {
    const isActive = btn.dataset.sectionTarget === section;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.setAttribute("tabindex", isActive ? "0" : "-1");
  });
}
