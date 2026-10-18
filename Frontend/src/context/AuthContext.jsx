
import { createContext, useContext, useEffect, useState } from "react";
import {
  loginAdmin,
  logoutAdmin,
  fetchCurrentAdmin,
  getStoredUser,
  clearSession,
} from "../api/axios";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const cached = getStoredUser();

  if (cached) {
    setUser(cached);
    refreshUser();
  } else {
    // No admin logged in is NORMAL.
    // Do not redirect.
    setLoading(false);
  }

  const handleSessionExpired = () => {
    clearUser();
  };

  window.addEventListener(
    "auth:session-expired",
    handleSessionExpired
  );

  return () => {
    window.removeEventListener(
      "auth:session-expired",
      handleSessionExpired
    );
  };
}, []);

  const refreshUser = async () => {
  try {
    const admin = await fetchCurrentAdmin();

    if (admin) {
      setUser(admin);
    } else {
      setUser(null);
    }
  } catch (error) {
    // No admin session is NOT an error for normal visitors.
    setUser(null);
  } finally {
    setLoading(false);
  }
};

  const login = async ({ mobileNumber, password }) => {
    const admin = await loginAdmin({
      mobileNumber,
      password,
    });

    setUser(admin);

    return admin;
  };

  const clearUser = () => {
    clearSession();
    setUser(null);
  };

  const logout = async () => {
    try {
      await logoutAdmin();
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
        login,
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

export const useAuth = () => useContext(AuthContext);

