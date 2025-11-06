export const pad2 = (n) => String(n).padStart(2, "0");

export const fmtYMD = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const isValidDateString = (value) => {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

export const normalizeDate = (value) => {
  if (!isValidDateString(value)) {
    return null;
  }
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const getCurrentMonthEndDate = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(0, 0, 0, 0);
  return end;
};

export const getCurrentMonthStartDate = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getLastMonthStartDate = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getLastMonthEndDate = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  end.setHours(0, 0, 0, 0);
  return end;
};
