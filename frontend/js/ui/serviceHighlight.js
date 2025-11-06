let activeRow = null;

export function setActiveServiceRowElement(row) {
  if (activeRow && activeRow !== row) {
    activeRow.classList.remove("is-active");
  }
  activeRow = row || null;
  if (activeRow) {
    activeRow.classList.add("is-active");
  }
}

export function clearActiveServiceRow() {
  setActiveServiceRowElement(null);
}

export function getActiveServiceRow() {
  return activeRow;
}
