import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

const setSession = ({ user, accessToken } = {}) => {
  if (user) {
    localStorage.setItem("user", JSON.stringify(user));
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
// Request interceptor: attach the access token
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
// Optional token refresh
//
// Your user routes do not have a refresh-token endpoint yet, so this is OFF.
// When you add one (e.g. POST /api/v1/users/refresh-token), set
// REFRESH_ENDPOINT below and the interceptor will start using it.
// ---------------------------------------------------------------------------

const REFRESH_ENDPOINT = null; // e.g. "/api/v1/users/refresh-token"

let isRefreshing = false;
let refreshPromise = null;

const performRefresh = async () => {
  const res = await axios.post(
    `${import.meta.env.VITE_API_URL}${REFRESH_ENDPOINT}`,
    {},
    { withCredentials: true }
  );

  const newAccessToken = res.data.data?.accessToken;

  if (!newAccessToken) {
    throw new Error("Refresh did not return an access token");
  }

  localStorage.setItem("accessToken", newAccessToken);

  return newAccessToken;
};

// Tell the app the session is over. AuthContext listens for this and
// ProtectedRoute then sends the user to /login.
const expireSession = () => {
  clearSession();
  window.dispatchEvent(new Event("auth:session-expired"));
};

// ---------------------------------------------------------------------------
// Response interceptor
// ---------------------------------------------------------------------------

API.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // No token means nobody was logged in (a wrong password on /login
    // also lands here). Nothing to refresh or expire.
    if (!localStorage.getItem("accessToken")) {
      return Promise.reject(error);
    }

    // Never try to refresh because login/logout/refresh themselves failed.
    const url = originalRequest.url || "";
    if (url.includes("/login") || url.includes("/logout") || url.includes("/refresh")) {
      return Promise.reject(error);
    }

    // No refresh endpoint configured: the session is simply over.
    if (!REFRESH_ENDPOINT) {
      expireSession();
      return Promise.reject(error);
    }

    // Prevent infinite retry loops.
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      // If another request is already refreshing, wait for it.
      if (!isRefreshing) {
        isRefreshing = true;

        refreshPromise = performRefresh().finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
      }

      await refreshPromise;

      // The request interceptor re-reads the new token on retry.
      return API(originalRequest);
    } catch (refreshError) {
      expireSession();
      return Promise.reject(refreshError);
    }
  }
);

// ---------------------------------------------------------------------------
// Auth endpoints  (backend: /api/v1/users)
// ---------------------------------------------------------------------------

const AUTH_BASE = "/api/v1/users";

// Login. Pass whatever your loginUser controller expects,
// e.g. { email, password } or { username, password }.
export const loginUser = async (credentials) => {
  const res = await API.post(`${AUTH_BASE}/login`, credentials);

  // Expected shape: { data: { user, accessToken } }
  const { user, accessToken } = res.data.data;

  setSession({ user, accessToken });

  return user;
};

// Register a new student account
export const registerUser = async (payload) => {
  const res = await API.post(`${AUTH_BASE}/register`, payload);

  return res.data.data;
};

// Logout
export const logoutUser = async () => {
  try {
    await API.post(`${AUTH_BASE}/logout`);
  } finally {
    clearSession();
  }
};

// Get the currently logged-in user
export const fetchCurrentUser = async () => {
  const res = await API.get(`${AUTH_BASE}/me`);

  const user = res.data.data;

  setSession({ user });

  return user;
};

// Change password
export const changePassword = async ({ oldPassword, newPassword }) => {
  const res = await API.patch(`${AUTH_BASE}/me/password`, {
    oldPassword,
    newPassword,
  });

  return res.data.data;
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { getStoredUser, clearSession };

export default API;