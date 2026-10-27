// Fixed choices for the setup form, so nobody has to type them (typos were the main reason an
// official schedule did not show up).
//
// KEEP IN SYNC with the backend: BRANCHES and SECTIONS must equal the lists in
// Backend/src/utils/constants.js. If you add a branch there, add it here too.


export const BRANCHES = ["CSE", "IT", "ECE", "EEE", "ME", "CE"];
export const SECTIONS = ["A", "B", "C", "D", "E", "F"];
export const SEMESTERS = ["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5", "Sem 6", "Sem 7", "Sem 8"];

export const academicYearOptions = () => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1].map((s) => `${s}-${String(s + 1).slice(-2)}`);
};

// Match a loose value ("cse ") to an option ("CSE"); "" if nothing matches.
export const pickOption = (options, value) => {
  const v = String(value || "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === v) || "";
};

// Keep a stored value selectable even if it isn't in the standard list.
export const withCurrent = (options, current) => {
  const c = String(current || "").trim();
  return c && !options.includes(c) ? [c, ...options] : options;
};