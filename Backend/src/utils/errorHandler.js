// middlewares/errorHandler.middleware.js
import { ApiError } from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
    let error = err;

    // If it's not already an ApiError, normalize it into one
    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || (error instanceof Error ? 500 : 500);
        const message = error.message || "Something went wrong";
        error = new ApiError(statusCode, message, error?.errors || [], err.stack);
    }

    const response = {
        success: error.success,
        message: error.message,
        errors: error.errors,
        data: error.data,
        ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {})
    };

    return res.status(error.statusCode).json(response);
};

export { errorHandler };