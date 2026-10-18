import { asyncHandler } from "../utils/asyncHandler.js";

export const optionalAuth = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return next(); // anonymous — req.user stays undefined

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken");
        if (user) req.user = user; // valid token → req.user populated
    } catch (error) {
        // invalid/expired token → treated as anonymous, not an error
    }
    next();
});