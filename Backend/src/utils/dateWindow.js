import { ATTENDANCE_STATUS, DAY_MS } from './constants.js';

// Pure date helpers for the day and week views. Dates are UTC midnight, like everywhere else.

const toDateText = (date) => date.toISOString().slice(0, 10);
const fromDateText = (text) => new Date(`${text}T00:00:00.000Z`);
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

// The 7-day window containing `date`. weekStart: 0 = Sunday ... 6 = Saturday (default Monday).
const weekBounds = (date, weekStart = 1) => {
  const offset = (date.getUTCDay() - weekStart + 7) % 7;
  const start = addDays(date, -offset);
  return { start, end: addDays(start, 6) };
};

// "Now" in the setup's timezone: { date: 'YYYY-MM-DD', time: 'HH:mm' }
const nowInZone = (timezone) => {
  const now = new Date();
  try {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now);
    return { date, time };
  } catch {
    return { date: now.toISOString().slice(0, 10), time: now.toISOString().slice(11, 16) };
  }
};

// Zero-padded HH:mm strings compare correctly as text
const timesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// The first class today that has not started and is still going ahead.
// classes must be sorted by plannedStartTime.
const NOT_GOING_AHEAD = new Set([ATTENDANCE_STATUS.CANCELLED, ATTENDANCE_STATUS.NOT_COUNTED]);
const pickNextClass = (classes, nowTime) =>
  classes.find((c) => c.plannedStartTime > nowTime && !NOT_GOING_AHEAD.has(c.status)) ?? null;

export { toDateText, fromDateText, addDays, weekBounds, nowInZone, timesOverlap, pickNextClass };