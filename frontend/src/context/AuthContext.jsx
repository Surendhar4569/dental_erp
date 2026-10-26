import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

import { toast } from 'react-toastify';

const INACTIVITY_TIMEOUT_MS =
  (parseInt(import.meta.env.VITE_INACTIVITY_TIMEOUT_MINUTES, 10) || 15) * 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('dental_erp_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('dental_erp_token'));
  const [isLoading, setIsLoading] = useState(true);

  // Synchronize and verify current user on application load
  const loadUser = useCallback(async () => {
    const storedToken = localStorage.getItem('dental_erp_token');
    if (!storedToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await authService.getCurrentUser();
      if (res && res.user) {
        setUser(res.user);
        localStorage.setItem('dental_erp_user', JSON.stringify(res.user));
      }
    } catch (err) {
      console.warn('Session verification failed:', err.message);
      setUser(null);
      setToken(null);
      localStorage.removeItem('dental_erp_token');
      localStorage.removeItem('dental_erp_user');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout handler
  const logout = useCallback(async (reason = 'USER_LOGOUT') => {
    await authService.logout(reason);
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    loadUser();

    // Listen for global unauthorized events from axios interceptor
    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [loadUser]);

  // Client-Side Inactivity Monitor for Clinical Terminal Protection
  // Protects unattended dental clinic workstations by automatically logging out after 15 minutes of inactivity.
  useEffect(() => {
    if (!token || !user) return;

    let lastActivity = Date.now();

    const handleUserActivity = () => {
      lastActivity = Date.now();
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      const idleTime = Date.now() - lastActivity;
      if (idleTime >= INACTIVITY_TIMEOUT_MS) {
        toast.info('Session timed out due to 15 minutes of inactivity for patient data privacy. Please sign in again.');
        logout('INACTIVITY_TIMEOUT');
      }
    }, 15000); // Evaluates every 15 seconds

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      clearInterval(checkInterval);
    };
  }, [token, user, logout]);

  // Login handler
  const login = async (email, password) => {
    const data = await authService.login(email, password);
    if (data && data.token && data.user) {
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('dental_erp_token', data.token);
      localStorage.setItem('dental_erp_user', JSON.stringify(data.user));
      return data.user;
    }
    throw new Error(data.message || 'Login failed');
  };

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
    refreshUser: loadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
