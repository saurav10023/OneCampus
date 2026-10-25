// import jwt from 'jsonwebtoken';
// import { ApiError } from '../utils/ApiError.js';
// import { asyncHandler } from '../utils/asyncHandler.js';
// import { User } from '../models/user.model.js';

// export const verifyJWT = asyncHandler(async (req, res, next) => {
//   // The Authorization header wins, so a stale cookie cannot override a valid header token
//   const bearer = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
//   const token = bearer || req.cookies?.accessToken;

//   if (!token) throw new ApiError(401, 'Unauthorized request');

//   let decodedToken;
//   try {
//     decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
//   } catch {
//     throw new ApiError(401, 'Invalid or expired token');
//   }

//   const user = await User.findById(decodedToken?._id).select('-password');
//   if (!user || user.isDeleted || !user.isActive) {
//     throw new ApiError(401, 'Invalid access token');
//   }

//   if (user.passwordChangedAt && decodedToken.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
//     throw new ApiError(401, 'Session expired. Please log in again.');
//   }

//   req.user = user;
//   next();
// });
// middlewares/auth.middleware.js  (BACKEND)
//
// COMPARE THIS WITH YOUR CURRENT FILE BEFORE REPLACING IT. I could not see your original, so keep
// any extra checks it has. The important parts are:
//   1. The token is read from the Authorization header FIRST, and the cookie is only a fallback.
//      (Vercel -> Render is a cross-site request, so the cookie is often not sent at all.)
//   2. A token issued right after a password change must not be rejected.
//
// Imports follow the style used by your controllers. If your utils export these as named exports
// instead, change the two import lines to:
//   import { ApiError } from "../utils/ApiError.js";
//   import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";

const readToken = (req) => {
  const header = req.header("Authorization");
  if (typeof header === "string") {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  return req.cookies?.accessToken || null;
};

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) {
    throw new ApiError(401, "Unauthorized request: no access token");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }

  const user = await User.findById(decoded?._id).select("-password");
  if (!user) {
    throw new ApiError(401, "Invalid access token");
  }

  // A scheduled-for-deletion account cannot use old tokens (it is restored by logging in again)
  if (user.isDeleted) {
    throw new ApiError(401, "This account is scheduled for deletion. Log in again to restore it.");
  }
  if (user.isActive === false) {
    throw new ApiError(403, "This account is not active. Please contact the administrator.");
  }

  // Tokens issued before the last password change stop working.
  // JWT `iat` is in whole seconds, so compare in seconds. Comparing iat*1000 with the exact
  // millisecond timestamp rejects the fresh token that changePassword returns in the same second.
  if (user.passwordChangedAt) {
    const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (typeof decoded.iat === "number" && decoded.iat < changedAtSeconds) {
      throw new ApiError(401, "Password was changed. Please log in again.");
    }
  }

  req.user = user;
  next();
});