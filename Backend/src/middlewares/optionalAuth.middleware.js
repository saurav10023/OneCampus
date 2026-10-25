import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/user.model.js';

export const optionalAuth = asyncHandler(async (req, res, next) => {
  const bearer = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const token = bearer || req.cookies?.accessToken;
  if (!token) return next(); // anonymous: req.user stays undefined

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded?._id).select('-password');
    const passwordOk =
      !user?.passwordChangedAt ||
      decoded.iat >= Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (user && !user.isDeleted && user.isActive && passwordOk) req.user = user;
  } catch {
    // invalid or expired token: treated as anonymous
  }
  next();
});