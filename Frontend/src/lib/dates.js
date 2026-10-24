// Calendar-date helpers. All dates are "YYYY-MM-DD" strings (UTC midnight on the backend).

export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dayLabel = (iso, long = false) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
        weekday: long ? "long" : "short",
        day: "numeric",
        month: "short",
        ...(long ? { year: "numeric" } : {}),
        timeZone: "UTC",
      })
    : "";