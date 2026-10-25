import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  loginUser,
  logoutUser,
  fetchCurrentUser,
  getStoredUser,
  clearSession,
  registerUser,
} from "../api/axios";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearUser = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const current = await fetchCurrentUser();
      setUser(current || null);
    } catch (error) {
      // Only a rejected session ends the login. Network errors, timeouts, 404 and 5xx
      // (a Render cold start, for example) keep the cached user.
      if (error?.response?.status === 401) {
        clearSession();
        setUser(null);
      } else {
        console.error("Could not refresh user:", error?.response?.status ?? error?.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getStoredUser();

    if (cached) {
      // Show the cached user instantly, then confirm with the server.
      setUser(cached);
      refreshUser();
    } else {
      setLoading(false);
    }

    // Fired by api/axios.js when the server answers 401 to a logged-in request.
    window.addEventListener("auth:session-expired", clearUser);

    return () => {
      window.removeEventListener("auth:session-expired", clearUser);
    };
  }, [refreshUser, clearUser]);

  // Returns the user. `lastLoginRestored` is true when logging in cancelled a pending deletion.
  const [lastLoginRestored, setLastLoginRestored] = useState(false);

  const login = async (credentials) => {
    const { user: loggedIn, accountRestored } = await loginUser(credentials);
    setLastLoginRestored(accountRestored);

    // Confirm the server accepts the token it just issued BEFORE entering the app.
    // Without this check a server that rejects the token (wrong auth setup) shows up as the
    // login page flashing back a second later, with no explanation.
    try {
      const confirmed = await fetchCurrentUser();
      const finalUser = confirmed || loggedIn;
      setUser(finalUser);
      return finalUser;
    } catch (error) {
      if (error?.response?.status === 401) {
        clearSession();
        setUser(null);
        throw new Error(
          "You logged in, but the server rejected your session token. " +
            "This is a server setup problem (token not read from the Authorization header, " +
            "or ACCESS_TOKEN_SECRET differs). Please tell the developer."
        );
      }
      // Network hiccup or a 5xx: the login itself worked, so keep the user signed in.
      setUser(loggedIn);
      return loggedIn;
    }
  };

  const register = async (payload) => registerUser(payload);

  const logout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearUser();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        login,
        lastLoginRestored,
        register,
        logout,
        setUser,
        refreshUser,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return ctx;
};