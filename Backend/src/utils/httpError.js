// Small helper so services, validators and controllers all raise errors the same way.
// Your error-handling middleware should read `status`, `code`, `message` and `details`.
// If you already have an ApiError class, replace this file's body with a re-export of it.
export const httpError = (status, code, message, details) =>
  Object.assign(new Error(message), { status, code, ...(details ? { details } : {}) });

export default httpError;