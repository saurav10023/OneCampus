import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import './models/index.js';

const app = express();

// Behind Render / Nginx, so rate limiting sees the real client IP
app.set('trust proxy', 1);

// ---------- CORS ----------
// Two sources of allowed origins:
//  1. BUILT_IN_ORIGINS below. They work even if the CORS_ORIGIN variable on Render is missing or
//     wrong. They are tied to this Vercel account's team slug (sauravsonu216-3147s-projects), so
//     nobody else can create a matching *.vercel.app address.
//  2. CORS_ORIGIN (optional): a comma-separated list of extra origins. An entry can be an exact
//     origin or a pattern where * matches one hostname part (letters, digits and dashes).
// Vercel gives every deployment its own preview URL, which is why a pattern is needed.
const BUILT_IN_ORIGINS = [
  'https://one-campus.vercel.app', // production alias
  /^https:\/\/one-campus(-[a-z0-9]+)*-sauravsonu216-3147s-projects\.vercel\.app$/i, // previews and team alias
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000',
];

const escapeRegex = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

const envRules = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, ''))
  .filter(Boolean)
  .map((rule) =>
    rule.includes('*')
      ? new RegExp(`^${escapeRegex(rule).replace(/\*/g, '[a-z0-9-]+')}$`, 'i')
      : rule.toLowerCase()
  );

const originRules = [...BUILT_IN_ORIGINS.map((r) => (typeof r === 'string' ? r.toLowerCase() : r)), ...envRules];

const isAllowedOrigin = (origin) =>
  originRules.some((rule) =>
    typeof rule === 'string' ? rule === origin.toLowerCase() : rule.test(origin)
  );

console.log('[cors] extra origins from CORS_ORIGIN:', process.env.CORS_ORIGIN || '(not set)');

app.use(
  cors({
    // No Origin header (curl, server-to-server, same-origin) is allowed through.
    // NOTE: when this returns false the cors package does NOT answer the preflight at all; the
    // request falls through to Express, which replies "200 DELETE, POST" with no CORS headers.
    origin: (origin, cb) => {
      const ok = !origin || isAllowedOrigin(origin);
      if (!ok) console.warn('[cors] blocked origin:', origin);
      cb(null, ok);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // browsers cache the preflight answer for a day
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.static('public'));
app.use(cookieParser());

// Cheap route for uptime pings (keeps a free Render instance awake) and quick "is it up" checks
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// ---------- route imports ----------
import userRoutes from './routes/user.routes.js';
import subjectRoutes from './routes/subject.routes.js';
import setupRoutes from './routes/setup.routes.js';
import recurringRuleRoutes from './routes/recurringRule.routes.js';
import occurrenceRoutes from './routes/occurrence.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import extraClassRoutes from './routes/extraClassAdjustment.routes.js';
import calendarEventRoutes from './routes/calendarEvent.routes.js';
import scheduleRoleRoutes from './routes/scheduleRole.routes.js';
import officialScheduleRoutes from './routes/officialSchedule.routes.js';
import scheduleSubjectRoutes from './routes/scheduleSubject.routes.js';
import scheduleRuleRoutes from './routes/scheduleRule.routes.js';
import scheduleItemRoutes from './routes/scheduleItem.routes.js';
import scheduleActionRoutes from './routes/scheduleAction.routes.js';
import scheduleRolloutRoutes from './routes/scheduleRollout.routes.js';
import officialJoinRoutes from './routes/officialJoin.routes.js';
import officialSyncRoutes from './routes/officialSync.routes.js';
import officialUpdateRoutes from './routes/officialUpdate.routes.js';
import sharedPublicationRoutes from './routes/sharedPublication.routes.js';
import copyRoutes from './routes/copy.routes.js';

// ---------- student side (per setup) ----------
app.use('/api/v1/setup/:setupId/official', officialJoinRoutes);
app.use('/api/v1/setup/:setupId/official', officialSyncRoutes);
app.use('/api/v1/setup/:setupId/official', officialUpdateRoutes);
app.use('/api/v1/setup/:setupId/calendar-events', calendarEventRoutes);
app.use('/api/v1/setup/:setupId/extra-classes', extraClassRoutes);
app.use('/api/v1/setup/:setupId/attendance', attendanceRoutes);
app.use('/api/v1/setup/:setupId/occurrences', occurrenceRoutes);
app.use('/api/v1/setup/:setupId/subjects', subjectRoutes);
app.use('/api/v1/setup/:setupId/rules', recurringRuleRoutes);

// ---------- CR / admin side ----------
app.use('/api/v1/schedule-roles', scheduleRoleRoutes);
app.use('/api/v1/official-schedules/:scheduleId/subjects', scheduleSubjectRoutes);
app.use('/api/v1/official-schedules/:scheduleId/rules', scheduleRuleRoutes);
app.use('/api/v1/official-schedules/:scheduleId/items', scheduleItemRoutes);
app.use('/api/v1/official-schedules/:scheduleId/actions', scheduleActionRoutes);
app.use('/api/v1/official-schedules/:scheduleId/rollout', scheduleRolloutRoutes); // before the line below
app.use('/api/v1/official-schedules', officialScheduleRoutes);

// ---------- sharing ----------
app.use('/api/v1/publications', sharedPublicationRoutes);
app.use('/api/v1/copies', copyRoutes);

// ---------- users and setups ----------
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/setup', setupRoutes);

// Unknown route
app.use((req, res) =>
  res.status(404).json({ success: false, statusCode: 404, message: 'Route not found', errors: [] })
);

// Turns library errors into the same JSON shape as ApiError
const normalizeError = (err) => {
  if (err.statusCode) return err;

  if (err.name === 'ValidationError' && err.errors) {
    return {
      statusCode: 400,
      message: 'Validation failed',
      errors: Object.values(err.errors).map((e) => `${e.path}: ${e.message}`),
    };
  }
  if (err.name === 'CastError') {
    return { statusCode: 400, message: `Invalid ${err.path}`, errors: [] };
  }
  if (err.code === 11000) {
    return { statusCode: 409, message: 'Duplicate value', errors: Object.keys(err.keyPattern || {}) };
  }
  if (err.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'Invalid JSON body', errors: [] };
  }
  if (err.type === 'entity.too.large') {
    return { statusCode: 413, message: 'Request body too large', errors: [] };
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { statusCode: 401, message: 'Invalid or expired token', errors: [] };
  }
  return err;
};

app.use((err, req, res, next) => {
  const normalized = normalizeError(err);
  const statusCode = normalized.statusCode || 500;

  if (statusCode >= 500) console.error(err);
  const message =
    statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : normalized.message || 'Internal Server Error';

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: normalized.errors || [],
  });
});

export { app };