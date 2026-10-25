import rateLimit from 'express-rate-limit';

const limited = (message, max) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    skipSuccessfulRequests: true, // only failed attempts count
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, statusCode: 429, message, errors: [] },
  });

export const loginLimiter = limited('Too many login attempts. Please try again after 15 minutes.', 20);
export const registerLimiter = limited('Too many sign-up attempts. Please try again later.', 20);