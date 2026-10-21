import express from 'express';
import cookieParser from 'cookie-parser';
import cors from "cors" ;

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

// TODO: uncomment once the login middleware is added inside calendarEvent.routes.js
// import {calendarEventRoutes }from "./routes/calendarEvent.routes.js";



app.use("/api/v1/users", userRoutes);



// app.use("/api/v1/setup/:setupId/subjects", subjectRoutes);

app.use(
    "/api/v1/setup/:setupId/subjects",subjectRoutes
);

app.use("/api/v1/setup",  (req, res, next)=>{console.log("setup MOUNT HIT", req.method, req.originalUrl);
    next();} ,setupRoutes);


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