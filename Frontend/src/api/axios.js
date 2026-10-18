
import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

const setSession = ({ admin, accessToken } = {}) => {
  if (admin) {
    localStorage.setItem("user", JSON.stringify(admin));
  }

  if (accessToken) {
    localStorage.setItem("accessToken", accessToken);
  }
};

const clearSession = () => {
  localStorage.removeItem("user");
  localStorage.removeItem("accessToken");
};

const getStoredUser = () => {
  const raw = localStorage.getItem("user");

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Request interceptor
// ---------------------------------------------------------------------------

API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("accessToken");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Shared refresh state
// ---------------------------------------------------------------------------

let isRefreshing = false;
let refreshPromise = null;

const performRefresh = async () => {
  const res = await axios.post(
    `${import.meta.env.VITE_API_URL}/api/v1/admin/refresh-token`,
    {},
    {
      withCredentials: true,
    }
  );

  const newAccessToken = res.data.data?.accessToken;

  if (!newAccessToken) {
    throw new Error("Refresh token did not return an access token");
  }

  localStorage.setItem("accessToken", newAccessToken);

  return newAccessToken;
};

// ---------------------------------------------------------------------------
// Response interceptor
// ---------------------------------------------------------------------------

API.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Only handle 401 responses.
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // ---------------------------------------------------------
    // IMPORTANT:
    // If there is no access token, there is no admin session.
    //
    // This is NORMAL for a normal visitor.
    // Do NOT try refresh and do NOT redirect to login.
    // ---------------------------------------------------------

    const accessToken = localStorage.getItem("accessToken");

    if (!accessToken) {
      return Promise.reject(error);
    }

    // Prevent infinite retry loops.
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      // -------------------------------------------------------
      // If another request is already refreshing, wait for it.
      // -------------------------------------------------------

      if (!isRefreshing) {
        isRefreshing = true;

        refreshPromise = performRefresh().finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
      }

      await refreshPromise;

      // Retry original request with the new access token.
      return API(originalRequest);
    } catch (refreshError) {
      // -------------------------------------------------------
      // The existing admin session is genuinely expired.
      //
      // Clear the local admin session.
      //
      // DO NOT navigate to /login here.
      // AdminRouteGuard will handle /admin/*.
      // Normal pages remain accessible.
      // -------------------------------------------------------

      clearSession();

      return Promise.reject(refreshError);
    }
  }
);

// ---------------------------------------------------------------------------
// Admin authentication endpoints
// ---------------------------------------------------------------------------

const AUTH_BASE = "/api/v1/admin";

// Login
export const loginAdmin = async ({ mobileNumber, password }) => {
  const res = await API.post(`${AUTH_BASE}/login`, {
    mobileNumber,
    password,
  });

  const { admin, accessToken } = res.data.data;

  setSession({
    admin,
    accessToken,
  });

  return admin;
};

// Register another admin/staff member
export const registerAdmin = async ({
  mobileNumber,
  username,
  password,
}) => {
  const res = await API.post(`${AUTH_BASE}/register`, {
    mobileNumber,
    username,
    password,
  });

  return res.data.data;
};

// Logout
export const logoutAdmin = async () => {
  try {
    await API.post(`${AUTH_BASE}/logout`);
  } finally {
    clearSession();
  }
};

// Get currently logged-in admin
export const fetchCurrentAdmin = async () => {
  const res = await API.get(`${AUTH_BASE}/current-admin`);

  const admin = res.data.data;

  setSession({
    admin,
  });

  return admin;
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  getStoredUser,
  clearSession,
};

export default API;

