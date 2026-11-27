import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, authStorage } from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(authStorage.getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verifySession() {
      const token = authStorage.getToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const data = await api.get('/auth/me');
        setUser(data.user);
        authStorage.setUser(data.user);
      } catch (err) {
        console.warn('Session verification failed, signing out:', err);
        authStorage.clearToken();
        authStorage.clearUser();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    verifySession();

    const handleExpired = () => {
      setUser(null);
    };

    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = async (username, pin) => {
    const data = await api.post('/auth/login', { username, pin });
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch (e) {
      // ignore
    } finally {
      authStorage.clearToken();
      authStorage.clearUser();
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    isAdmin: Boolean(user && (user.isAdmin || user.role === 'AKR' || user.role === 'CKG')),
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
