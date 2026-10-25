import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('risklens_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  // Sync user state with localStorage and verify token on initial load
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);
          localStorage.setItem('risklens_user', JSON.stringify(res.data));
        } catch {
          // Token is expired or invalid
          localStorage.removeItem('token');
          localStorage.removeItem('risklens_user');
          setUser(null);
        }
      } else {
        setUser(null);
        localStorage.removeItem('risklens_user');
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const token = res.data.access_token;
    localStorage.setItem('token', token);

    const meRes = await api.get('/auth/me');
    const userData = meRes.data;
    setUser(userData);
    localStorage.setItem('risklens_user', JSON.stringify(userData));
    return true;
  };

  const register = async (name, email, password) => {
    await api.post('/auth/register', {
      full_name: name,
      email,
      password
    });
    return await login(email, password);
  };

  const demoLogin = async () => {
    const res = await api.post('/auth/demo-login');
    const token = res.data.access_token;
    localStorage.setItem('token', token);

    const meRes = await api.get('/auth/me');
    const userData = meRes.data;
    setUser(userData);
    localStorage.setItem('risklens_user', JSON.stringify(userData));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('risklens_user');
    localStorage.removeItem('risklens_latest_prediction');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        register,
        demoLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
