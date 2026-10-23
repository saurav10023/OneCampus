import { normalizeScopePart } from './scopeKey.js';
import { SCHEDULE_ROLE, SCHEDULE_ROLE_STATUS, ROLE_REQUEST_COOLDOWN_HOURS } from './constants.js';

// Pure permission rules for the official schedule. `roles` are one user's ScheduleRole rows.
// The account role on User (student, cr, moderator, admin) is NOT used here: only an ACTIVE
// ScheduleRole gives any power over a schedule.

const isActive = (role) => role.status === SCHEDULE_ROLE_STATUS.ACTIVE;
const sameClass = (role, target) =>
  normalizeScopePart(role.branch) === normalizeScopePart(target.branch) &&
  normalizeScopePart(role.section) === normalizeScopePart(target.section);

// An admin covers a whole college. A CR covers one branch and section (all semesters).
// target: { collegeKey, branch, section }
const canEditSchedule = (roles, target) =>
  roles.some(
    (r) =>
      isActive(r) &&
      r.collegeKey === target.collegeKey &&
      (r.role === SCHEDULE_ROLE.ADMIN || (r.role === SCHEDULE_ROLE.CR && sameClass(r, target)))
  );

// Only a college admin approves, rejects or revokes roles and reverts anyone's action
const isCollegeAdmin = (roles, collegeKey) =>
  roles.some((r) => isActive(r) && r.role === SCHEDULE_ROLE.ADMIN && r.collegeKey === collegeKey);

// After a rejection the same user must wait before asking for a role again
const roleRequestCooldown = (lastRejectedAt, now = new Date(), hours = ROLE_REQUEST_COOLDOWN_HOURS) => {
  if (!lastRejectedAt) return { allowed: true, retryAt: null };
  const retryAt = new Date(new Date(lastRejectedAt).getTime() + hours * 60 * 60 * 1000);
  return now >= retryAt ? { allowed: true, retryAt: null } : { allowed: false, retryAt };
};

const hasFreeCrSeat = (activeCrCount, max) => activeCrCount < max;

export { canEditSchedule, isCollegeAdmin, roleRequestCooldown, hasFreeCrSeat };