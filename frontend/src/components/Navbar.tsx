import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Activity, ArrowRight, LogOut, Sparkles, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleStartAssessment = () => {
    if (isAuthenticated) {
      navigate('/assessment');
    } else {
      // Redirect to login, which will take user to assessment after sign in
      navigate('/login?redirect=/assessment');
    }
  };

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    if (location.pathname !== '/') {
      navigate('/#' + id);
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/85 backdrop-blur-md shadow-sm border-b border-slate-200/80 py-3.5'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-navy-900 via-blue-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-teal-500/20 group-hover:scale-105 transition-transform duration-300">
              <Activity className="w-5.5 h-5.5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading font-extrabold text-xl tracking-tight text-slate-900 flex items-center gap-1">
                risk<span className="text-teal-600">Lens</span>
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 -mt-1">
                Health AI
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors cursor-pointer"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('why-risklens')}
              className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors cursor-pointer"
            >
              Why riskLens
            </button>
            <button
              onClick={() => scrollToSection('health-insights')}
              className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors cursor-pointer"
            >
              Health Insights
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors cursor-pointer"
            >
              FAQ
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-teal-600 px-3 py-2 rounded-lg transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <span>Dashboard</span>
                </Link>
                <button
                  onClick={logout}
                  title="Sign out"
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm font-semibold text-slate-700 hover:text-teal-600 px-4 py-2 rounded-xl hover:bg-slate-100/80 transition-all"
              >
                Log In
              </Link>
            )}

            <button
              onClick={handleStartAssessment}
              className="relative inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-slate-900 via-blue-950 to-teal-700 hover:from-slate-800 hover:via-blue-900 hover:to-teal-600 rounded-xl shadow-lg shadow-teal-900/15 hover:shadow-teal-900/25 transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer group"
            >
              <Sparkles className="w-4 h-4 text-teal-300 group-hover:rotate-12 transition-transform" />
              <span>Start Health Assessment</span>
              <ArrowRight className="w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-lg border-b border-slate-200 px-4 pt-3 pb-6 space-y-4 shadow-xl">
          <nav className="flex flex-col space-y-3">
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-left text-base font-medium text-slate-700 hover:text-teal-600 py-1"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-left text-base font-medium text-slate-700 hover:text-teal-600 py-1"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('why-risklens')}
              className="text-left text-base font-medium text-slate-700 hover:text-teal-600 py-1"
            >
              Why riskLens
            </button>
            <button
              onClick={() => scrollToSection('health-insights')}
              className="text-left text-base font-medium text-slate-700 hover:text-teal-600 py-1"
            >
              Health Insights
            </button>
            <button
              onClick={() => scrollToSection('faq')}
              className="text-left text-base font-medium text-slate-700 hover:text-teal-600 py-1"
            >
              FAQ
            </button>
          </nav>
          <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 font-semibold text-slate-800 bg-slate-100 rounded-xl"
              >
                Go to Dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 font-semibold text-slate-700 border border-slate-200 rounded-xl"
              >
                Log In
              </Link>
            )}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleStartAssessment();
              }}
              className="w-full py-3 font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-md flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Start Health Assessment</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
