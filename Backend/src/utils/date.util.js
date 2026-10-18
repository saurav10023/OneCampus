const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// "YYYY-MM-DD" -> Date at UTC midnight, or null if invalid (e.g. 2026-02-31)
const parseDateOnly = (value) => {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject rolled-over dates like Feb 31
  return date.toISOString().slice(0, 10) === value ? date : null;
};

const formatDateOnly = (date) => date.toISOString().slice(0, 10);

export { parseDateOnly, formatDateOnly };