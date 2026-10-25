import axios from "axios";

// ---------------------------------------------------------------------------
// Base URL
//
// VITE_API_URL is the backend address, for example https://onecampus-0s7c.onrender.com
// (no trailing slash, no /api/v1). In local development use http://localhost:10000.
// Vite bakes this value in at BUILD time, so after changing it on Vercel you must redeploy.
// Login does not depend on cookies: the token from the login response is stored and sent
// in the Authorization header, so it works across Vercel and Render in every browser.
// ---------------------------------------------------------------------------

const BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

if (!BASE_URL && import.meta.env.PROD) {
  // eslint-disable-next-line no-console
  console.error("[api] VITE_API_URL is empty. Set it in the Vercel project settings and redeploy.");
}

const API = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // the cookie is only a fallback
  timeout: 60000, // a Render free-tier cold start can take close to a minute
});

// ---------------------------------------------------------------------------
// Storage helpers (never throw: storage can be blocked in private mode)
// ---------------------------------------------------------------------------

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const setSession = ({ user, accessToken } = {}) => {
  if (user) storage.set("user", JSON.stringify(user));
  if (accessToken) storage.set("accessToken", accessToken);
};

const clearSession = () => {
  storage.remove("user");
  storage.remove("accessToken");
};

const getStoredUser = () => {
  const raw = storage.get("user");
  if (!raw) return null;
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
    const token = storage.get("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Session expiry. Sent once, even if several requests fail together.
// ---------------------------------------------------------------------------

let expiring = false;
const expireSession = (reason) => {
  if (expiring) return;
  expiring = true;
  // This line names the request that ended the session, so a "login screen reappears"
  // problem can be traced in the browser console (F12 -> Console).
  // eslint-disable-next-line no-console
  console.warn("[auth] session ended by a 401:", reason);
  clearSession();
  window.dispatchEvent(new Event("auth:session-expired"));
  setTimeout(() => {
    expiring = false;
  }, 1000);
};

// ---------------------------------------------------------------------------
// Response interceptor: only a real 401 ends the session.
// Network errors, timeouts, 404 and 5xx (including a Render cold start) never log the user out.
// ---------------------------------------------------------------------------

const AUTH_PATHS = ["/login", "/register", "/logout"];

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const originalRequest = error.config;

    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Nobody was logged in (for example a wrong password on /login)
    if (!storage.get("user")) return Promise.reject(error);

    // A failed login, register or logout must not end the session
    const url = originalRequest.url || "";
    if (AUTH_PATHS.some((p) => url.includes(p))) return Promise.reject(error);

    expireSession(`${(originalRequest.method || "get").toUpperCase()} ${url} -> ${error.response?.data?.message || "no message"}`);
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Auth endpoints (backend: /api/v1/users)
// ---------------------------------------------------------------------------

const AUTH_BASE = "/api/v1/users";

// Body: { identifier, password } (identifier = username or 10-digit mobile)
export const loginUser = async (credentials) => {
  const res = await API.post(`${AUTH_BASE}/login`, credentials);
  const { user, accessToken, accountRestored } = res.data.data;
  clearSession(); // never mix a previous account's token with this login
  setSession({ user, accessToken });
  return { user, accountRestored: Boolean(accountRestored) };
};

export const registerUser = async (payload) => {
  const res = await API.post(`${AUTH_BASE}/register`, payload);
  return res.data.data;
};

export const logoutUser = async () => {
  try {
    await API.post(`${AUTH_BASE}/logout`);
  } finally {
    clearSession();
  }
};

export const fetchCurrentUser = async () => {
  const res = await API.get(`${AUTH_BASE}/me`);
  const user = res.data.data;
  setSession({ user });
  return user;
};

// The server returns a fresh token, because the old one stops working after a password change
export const changePassword = async ({ currentPassword, newPassword }) => {
  const res = await API.patch(`${AUTH_BASE}/me/password`, { currentPassword, newPassword });
  const { accessToken } = res.data.data ?? {};
  if (accessToken) storage.set("accessToken", accessToken);
  return res.data.data;
};

export { getStoredUser, clearSession };

export default API;