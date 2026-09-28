import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('risklens_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('risklens_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('risklens_user');
    }
  }, [user]);

  const login = async (email, _password) => {
    // Simulate auth API call
    await new Promise((res) => setTimeout(res, 500));
    const mockUser = {
      id: 'usr_' + Date.now(),
      name: email.split('@')[0].replace('.', ' ').replace(/^./, (c) => c.toUpperCase()),
      email,
    };
    setUser(mockUser);
    return true;
  };

  const register = async (name, email, _password) => {
    // Simulate register API call
    await new Promise((res) => setTimeout(res, 600));
    const mockUser = {
      id: 'usr_' + Date.now(),
      name,
      email,
    };
    setUser(mockUser);
    return true;
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        register,
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
