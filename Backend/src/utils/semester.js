import { normalizeScopePart } from './scopeKey.js';

// Reads a semester label as a number, so "5", "Sem 5", "Semester V", "5th" and "fifth" all mean 5.
// Used to FIND the official schedules for a student's semester. scopeKey.js is not changed: when
// a student joins, the setup takes the schedule's exact values, so the two scope keys agree.
// Returns null when the label has no single semester number in 1..12.

const MIN_SEMESTER = 1;
const MAX_SEMESTER = 12;

const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
};
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

const parseSemester = (label) => {
  const text = String(label ?? '').toLowerCase();
  const found = new Set();

  // Digits, also when glued to letters ("s5", "5th", "sem-3"). Three or more digits are a year.
  for (const match of text.matchAll(/\d+/g)) {
    if (match[0].length > 2) continue;
    const n = Number(match[0]);
    if (n >= MIN_SEMESTER && n <= MAX_SEMESTER) found.add(n);
  }
  // Whole words only: "fifth", "V", "VI"
  for (const token of text.split(/[^a-z]+/).filter(Boolean)) {
    if (ORDINALS[token]) found.add(ORDINALS[token]);
    else if (ROMAN[token]) found.add(ROMAN[token]);
  }
  return found.size === 1 ? [...found][0] : null;
};

// Same semester? Compares numbers when both labels have one, otherwise the labels themselves.
const semesterMatches = (a, b) => {
  const pa = parseSemester(a);
  const pb = parseSemester(b);
  if (pa !== null && pb !== null) return pa === pb;
  return normalizeScopePart(a) === normalizeScopePart(b);
};

export { parseSemester, semesterMatches, MIN_SEMESTER, MAX_SEMESTER };