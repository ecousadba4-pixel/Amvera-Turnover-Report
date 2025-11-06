const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

export const elements = {
  dashboard: $(".dashboard"),
  filterTitle: $("#filterTitle"),
  fromDate: $("#fromDate"),
  toDate: $("#toDate"),
  filterError: $("#filterError"),
  revenueValue: $("#revenue"),
  avg: $("#avg"),
  count: $("#count"),
  share: $("#share"),
  min: $("#min"),
  max: $("#max"),
  stay: $("#stay"),
  bonus: $("#bonus"),
  servicesShareValue: $("#servicesShare"),
  resetFiltersBtn: $("#resetFiltersBtn"),
  btnCurMonth: $("#btnCurMonth"),
  btnPrevMonth: $("#btnPrevMonth"),
  revenueSection: $("#revenueSection"),
  servicesSection: $("#servicesSection"),
  servicesList: $("#servicesList"),
  servicesTotal: $("#servicesTotal"),
  gate: $("#gate"),
  errBox: $("#err"),
  pwdInput: $("#pwd"),
  goBtn: $("#goBtn"),
  monthlyCard: $("#monthlyDetails"),
  monthlyTitle: $("#monthlyTitle"),
  monthlyEmpty: $("#monthlyEmpty"),
  monthlyTable: $("#monthlyTable"),
  monthlyRows: $("#monthlyRows"),
};

export const sectionButtons = $$('[data-section-target]');
export const summaryCards = $$(".info-summary .summary-card");
export const monthlyRangeButtons = $$('[data-monthly-range]');

export const presetButtons = [elements.btnCurMonth, elements.btnPrevMonth];

export const rangeInputs = { from: elements.fromDate, to: elements.toDate };
