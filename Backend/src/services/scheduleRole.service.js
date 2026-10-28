import ScheduleRole from '../models/Official/scheduleRole.model.js';
import ApiError from '../utils/ApiError.js';
import { roleRequestCooldown, hasFreeCrSeat } from '../utils/schedulePermissions.js';
import {
  DEFAULT_COLLEGE,
  SCHEDULE_ROLE,
  SCHEDULE_ROLE_STATUS as STATUS,
  MAX_ACTIVE_CRS_PER_SCHEDULE,
} from '../utils/constants.js';

// This app serves ONE college, so roles are never matched by college. Whoever holds an active
// admin role can see and decide every request. The college text is only stored on the role.
//
// Only an ACTIVE ScheduleRole gives any power over a schedule (see schedulePermissions.js).
// The schedule services call this to get the roles they pass to canEditSchedule.
const loadActiveRoles = (userId) => ScheduleRole.find({ userId, status: STATUS.ACTIVE }).lean();

const shapeRole = (role) => ({
  id: role._id,
  role: role.role,
  college: role.college,
  branch: role.branch ?? null,
  section: role.section ?? null,
  status: role.status,
  requestedAt: role.requestedAt,
  requestNote: role.requestNote ?? '',
  decidedAt: role.decidedAt ?? null,
  decisionNote: role.decisionNote ?? '',
});

// The admin's view also shows who is asking. The populated fields are the ones your User model has.
const shapeRoleForAdmin = (role) => {
  const user = role.userId && typeof role.userId === 'object' && role.userId._id ? role.userId : null;
  return {
    ...shapeRole(role),
    user: user
      ? { id: user._id, name: user.fullName ?? user.name ?? user.username ?? null, email: user.email ?? null }
      : { id: role.userId },
    decidedBy: role.decidedBy ?? null,
  };
};

// ---------- Student ----------

// A student asks to be the CR of one branch and section. Only the CR role can be requested:
// an admin is created by scripts/seedAdminRole.js, never by a request.
// input (already cleaned by the validator): { branch?, section?, note? }
const requestRole = async ({ user, input }) => {
  const branch = input.branch ?? user.branch;
  const section = input.section ?? user.section;
  if (!branch || !section) throw new ApiError(400, 'A CR request needs a branch and a section');

  const sameClass = { userId: user._id, role: SCHEDULE_ROLE.CR, branch, section };

  const open = await ScheduleRole.findOne({ ...sameClass, isOpen: true }).select('status').lean();
  if (open) {
    throw new ApiError(
      409,
      open.status === STATUS.ACTIVE
        ? 'You are already a CR for this class'
        : 'You already have a pending request for this class'
    );
  }

  const lastRejected = await ScheduleRole.findOne({ ...sameClass, status: STATUS.REJECTED })
    .sort({ decidedAt: -1 })
    .select('decidedAt')
    .lean();
  const cooldown = roleRequestCooldown(lastRejected?.decidedAt);
  if (!cooldown.allowed) {
    throw new ApiError(429, 'Your last request for this class was rejected. Please wait before asking again.', [
      `You can ask again after ${cooldown.retryAt.toISOString()}`,
    ]);
  }

  try {
    const role = await ScheduleRole.create({
      userId: user._id,
      college: user.college || DEFAULT_COLLEGE,
      role: SCHEDULE_ROLE.CR,
      branch,
      section,
      requestNote: input.note ?? '',
    });
    return shapeRole(role);
  } catch (err) {
    // The unique index caught a second request sent at the same moment
    if (err?.code === 11000) throw new ApiError(409, 'You already have an open request for this class');
    throw err;
  }
};

const listMyRoles = async (userId) => {
  const roles = await ScheduleRole.find({ userId }).sort({ requestedAt: -1, _id: -1 }).lean();
  return roles.map(shapeRole);
};

// Leave a role: a student withdraws a pending request, or gives up a role they hold.
const withdrawRole = async ({ roleId, userId }) => {
  const role = await ScheduleRole.findOne({ _id: roleId, userId });
  if (!role) throw new ApiError(404, 'Role not found');
  if (![STATUS.PENDING, STATUS.ACTIVE].includes(role.status)) {
    throw new ApiError(409, `This role is already ${role.status}`);
  }
  await assertNotLastAdmin(role);

  role.status = STATUS.REVOKED;
  role.decidedBy = userId;
  role.decidedAt = new Date();
  role.decisionNote = 'Withdrawn by the user';
  await role.save();
  return shapeRole(role);
};

// ---------- Admin ----------

// The caller must hold an ACTIVE admin role. No college is compared.
const assertAdmin = async (adminUserId) => {
  const adminRoles = (await loadActiveRoles(adminUserId)).filter((r) => r.role === SCHEDULE_ROLE.ADMIN);
  if (!adminRoles.length) throw new ApiError(403, 'Only an admin can do this');
};

// Loads a role and checks the caller is an active admin
const loadRoleForAdmin = async ({ roleId, adminUserId }) => {
  const role = await ScheduleRole.findById(roleId);
  if (!role) throw new ApiError(404, 'Role not found');
  await assertAdmin(adminUserId);
  return role;
};

// There must always be one active admin, or nobody could approve a CR again
const assertNotLastAdmin = async (role) => {
  if (role.role !== SCHEDULE_ROLE.ADMIN || role.status !== STATUS.ACTIVE) return;
  const admins = await ScheduleRole.countDocuments({ role: SCHEDULE_ROLE.ADMIN, status: STATUS.ACTIVE });
  if (admins <= 1) throw new ApiError(409, 'This is the last admin, so it cannot be removed');
};

// query (already cleaned): { status?, branch?, section? }. The default is pending requests.
const listRoleRequests = async ({ adminUserId, query = {} }) => {
  await assertAdmin(adminUserId);

  const filter = { status: query.status ?? STATUS.PENDING };
  if (query.branch) filter.branch = query.branch;
  if (query.section) filter.section = query.section;

  const roles = await ScheduleRole.find(filter)
    .sort({ requestedAt: 1, _id: 1 })
    .limit(200)
    .populate('userId', 'fullName name username email')
    .lean();
  return roles.map(shapeRoleForAdmin);
};

const approveRole = async ({ roleId, adminUserId, note }) => {
  const role = await loadRoleForAdmin({ roleId, adminUserId });
  if (String(role.userId) === String(adminUserId)) {
    throw new ApiError(403, 'You cannot decide your own request');
  }
  if (role.status !== STATUS.PENDING) throw new ApiError(409, `This request is already ${role.status}`);

  if (role.role === SCHEDULE_ROLE.CR) {
    // Two approvals sent at the exact same moment could both pass this check, so the limit can
    // be exceeded by one at worst. An admin can revoke the extra CR.
    const activeCrs = await ScheduleRole.countDocuments({
      role: SCHEDULE_ROLE.CR,
      branch: role.branch,
      section: role.section,
      status: STATUS.ACTIVE,
    });
    if (!hasFreeCrSeat(activeCrs, MAX_ACTIVE_CRS_PER_SCHEDULE)) {
      throw new ApiError(409, `This class already has ${MAX_ACTIVE_CRS_PER_SCHEDULE} active CRs. Revoke one first.`);
    }
  }

  role.status = STATUS.ACTIVE;
  role.decidedBy = adminUserId;
  role.decidedAt = new Date();
  role.decisionNote = note ?? '';
  await role.save();
  return shapeRole(role);
};

const rejectRole = async ({ roleId, adminUserId, note }) => {
  const role = await loadRoleForAdmin({ roleId, adminUserId });
  if (String(role.userId) === String(adminUserId)) {
    throw new ApiError(403, 'You cannot decide your own request');
  }
  if (role.status !== STATUS.PENDING) throw new ApiError(409, `This request is already ${role.status}`);

  role.status = STATUS.REJECTED;
  role.decidedBy = adminUserId;
  role.decidedAt = new Date();
  role.decisionNote = note ?? '';
  await role.save();
  return shapeRole(role);
};

// Takes away a role that is active
const revokeRole = async ({ roleId, adminUserId, note }) => {
  const role = await loadRoleForAdmin({ roleId, adminUserId });
  if (role.status !== STATUS.ACTIVE) throw new ApiError(409, `This role is ${role.status}, not active`);
  await assertNotLastAdmin(role);

  role.status = STATUS.REVOKED;
  role.decidedBy = adminUserId;
  role.decidedAt = new Date();
  role.decisionNote = note ?? '';
  await role.save();
  return shapeRole(role);
};

export {
  loadActiveRoles,
  requestRole,
  listMyRoles,
  withdrawRole,
  listRoleRequests,
  approveRole,
  rejectRole,
  revokeRole,
};