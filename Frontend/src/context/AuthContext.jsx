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
    } catch {
      // A dead session is handled by the axios interceptor.
      setUser(null);
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

    // Fired by api/axios.js when the token is rejected.
    window.addEventListener("auth:session-expired", clearUser);

    return () => {
      window.removeEventListener("auth:session-expired", clearUser);
    };
  }, [refreshUser, clearUser]);

  const login = async (credentials) => {
    const loggedIn = await loginUser(credentials);
    setUser(loggedIn);
    return loggedIn;
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