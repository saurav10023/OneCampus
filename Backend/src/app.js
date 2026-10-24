import express from 'express';
import cookieParser from 'cookie-parser';
import cors from "cors" ;
import './models/index.js';
const app = express()

app.use(cors({
    origin : process.env.CORS_ORIGIN,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use( (express.json( {limit:"16kb"} )))
app.use(express.urlencoded({extended:true , limit:"16kb"}))
app.use(express.static("public"))
app.use(cookieParser())  // use cookie in ueer controller   or anywhere


// routes 
// routes imports

import userRoutes from "./routes/user.routes.js";
import subjectRoutes from "./routes/subject.routes.js";
import setupRoutes from "./routes/setup.routes.js";
import recurringRuleRoutes from "./routes/recurringRule.routes.js";
import occurrenceRoutes from "./routes/occurrence.routes.js";

import attendanceRoutes from "./routes/attendance.routes.js";
import extraClassRoutes from "./routes/extraClassAdjustment.routes.js";
import calendarEventRoutes from "./routes/calendarEvent.routes.js";
import scheduleRoleRoutes from './routes/scheduleRole.routes.js';
import officialScheduleRoutes from './routes/officialSchedule.routes.js'
import scheduleSubjectRoutes from './routes/scheduleSubject.routes.js';
import scheduleRuleRoutes from './routes/scheduleRule.routes.js';
import scheduItemRoutes from './routes/scheduleItem.routes.js'
import scheduleActionRoutes from './routes/scheduleAction.routes.js'
import officialJoinRoutes from './routes/officialJoin.routes.js'

app.use("/api/v1/setup/:setupId/calendar-events", calendarEventRoutes);
app.use("/api/v1/setup/:setupId/extra-classes", extraClassRoutes);
app.use("/api/v1/setup/:setupId/attendance", attendanceRoutes);
app.use("/api/v1/setup/:setupId/occurrences", occurrenceRoutes);
app.use("/api/v1/setup/:setupId/official", officialJoinRoutes);
app.use("/api/v1/setup/:setupId/subjects",subjectRoutes);
app.use("/api/v1/setup/:setupId/rules", recurringRuleRoutes);

app.use('/api/v1/schedule-roles', scheduleRoleRoutes);
app.use('/api/v1/official-schedules/:scheduleId/subjects', scheduleSubjectRoutes);
app.use('/api/v1/official-schedules/:scheduleId/rules', scheduleRuleRoutes);
app.use('/api/v1/official-schedules/:scheduleId/items', scheduItemRoutes);
app.use('/api/v1/official-schedules/:scheduleId/actions', scheduleActionRoutes);
app.use('/api/v1/official-schedules', officialScheduleRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/setup",  (req, res, next)=>{console.log("setup MOUNT HIT", req.method, req.originalUrl);
    next();} ,setupRoutes);
// TODO: uncomment once the login middleware is added inside calendarEvent.routes.js
// import {calendarEventRoutes }from "./routes/calendarEvent.routes.js";







// app.use("/api/v1/setup/:setupId/subjects", subjectRoutes);





// Calendar events live under a setup: /api/v1/setup/:setupId/calendar-events
// app.use("/api/v1/setup/:setupId/calendar-events", calendarEventRoutes);




// Turns library errors into the same JSON shape as ApiError, so they are never a bare 500.
// ApiError already carries statusCode, message and errors, so it passes through untouched.
const normalizeError = (err) => {
  if (err.statusCode) return err;

  // Mongoose validation: the model's own rules failed
  if (err.name === "ValidationError" && err.errors) {
    return {
      statusCode: 400,
      message: "Validation failed",
      errors: Object.values(err.errors).map((e) => `${e.path}: ${e.message}`)
    };
  }
  // A malformed ObjectId or similar in a query
  if (err.name === "CastError") {
    return { statusCode: 400, message: `Invalid ${err.path}`, errors: [] };
  }
  // A unique index rejected the write
  if (err.code === 11000) {
    return {
      statusCode: 409,
      message: "Duplicate value",
      errors: Object.keys(err.keyPattern || {})
    };
  }
  // express.json: bad JSON or body over the size limit
  if (err.type === "entity.parse.failed") {
    return { statusCode: 400, message: "Invalid JSON body", errors: [] };
  }
  if (err.type === "entity.too.large") {
    return { statusCode: 413, message: "Request body too large", errors: [] };
  }
  // Token problems that escape the login middleware
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return { statusCode: 401, message: "Invalid or expired token", errors: [] };
  }
  return err;
};

app.use((err, req, res, next) => {
  const normalized = normalizeError(err);
  const statusCode = normalized.statusCode || 500;

  // Log real failures, and do not show internal messages to clients in production
  if (statusCode >= 500) console.error(err);
  const message =
    statusCode >= 500 && process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : normalized.message || "Internal Server Error";

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: normalized.errors || []
  });
});



export {app}