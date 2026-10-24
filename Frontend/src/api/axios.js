import axios from "axios";

// ---------------------------------------------------------------------------
// Base URL
//
// Production (Vercel): always same-origin, so vercel.json forwards /api/* to Render and the
// cookie belongs to the Vercel domain. A leftover VITE_API_URL cannot break this.
// Development: VITE_API_URL (e.g. http://localhost:10000), or "" if you use a Vite proxy.
// ---------------------------------------------------------------------------

const BASE_URL = import.meta.env.PROD ? "" : import.meta.env.VITE_API_URL ?? "";

const API = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
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
// Request interceptor: attach the access token if one is stored.
// With cookie-only login there is none, and the httpOnly cookie is used instead.
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
// Optional token refresh (OFF until the backend has a refresh endpoint)
// ---------------------------------------------------------------------------

const REFRESH_ENDPOINT = null; // e.g. "/api/v1/users/refresh-token"

let isRefreshing = false;
let refreshPromise = null;

const performRefresh = async () => {
  const res = await axios.post(`${BASE_URL}${REFRESH_ENDPOINT}`, {}, { withCredentials: true });
  const newAccessToken = res.data.data?.accessToken;
  if (!newAccessToken) throw new Error("Refresh did not return an access token");
  storage.set("accessToken", newAccessToken);
  return newAccessToken;
};

// Tell the app the session is over. Sent once, even if several requests fail together.
let expiring = false;
const expireSession = () => {
  if (expiring) return;
  expiring = true;
  clearSession();
  window.dispatchEvent(new Event("auth:session-expired"));
  setTimeout(() => {
    expiring = false;
  }, 1000);
};

// ---------------------------------------------------------------------------
// Response interceptor: only a real 401 ends the session.
// Network errors, timeouts, 5xx and cold starts never log the user out.
// ---------------------------------------------------------------------------

const AUTH_PATHS = ["/login", "/register", "/logout", "/refresh"];

API.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Nobody was logged in (for example a wrong password on /login)
    if (!storage.get("user")) return Promise.reject(error);

    // Auth calls failing must not trigger a refresh or an expiry
    const url = originalRequest.url || "";
    if (AUTH_PATHS.some((p) => url.includes(p))) return Promise.reject(error);

    // No refresh endpoint: the session is over
    if (!REFRESH_ENDPOINT) {
      expireSession();
      return Promise.reject(error);
    }

    if (originalRequest._retry) return Promise.reject(error);
    originalRequest._retry = true;

    try {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = performRefresh().finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return API(originalRequest);
    } catch (refreshError) {
      expireSession();
      return Promise.reject(refreshError);
    }
  }
);

// ---------------------------------------------------------------------------
// Auth endpoints (backend: /api/v1/users)
// ---------------------------------------------------------------------------

const AUTH_BASE = "/api/v1/users";

// Body: { identifier, password }. The token is in an httpOnly cookie;
// if the backend also returns accessToken, it is stored and sent as a Bearer header.
export const loginUser = async (credentials) => {
  const res = await API.post(`${AUTH_BASE}/login`, credentials);
  const { user, accessToken } = res.data.data;
  setSession({ user, accessToken });
  return user;
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

export const changePassword = async ({ currentPassword, newPassword }) => {
  const res = await API.patch(`${AUTH_BASE}/me/password`, { currentPassword, newPassword });
  return res.data.data;
};

export { getStoredUser, clearSession };

export default API;