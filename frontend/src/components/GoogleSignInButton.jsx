import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, AlertCircle, Info, X } from 'lucide-react';

export const GoogleSignInButton = ({ mode = 'signin', redirect = '/dashboard' }) => {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfigNotice, setShowConfigNotice] = useState(false);
  const tokenClientRef = useRef(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isConfigured = !!clientId && !clientId.includes('your_google_client_id');

  useEffect(() => {
    if (!isConfigured) return;

    // Load Google Identity Services script
    const scriptId = 'google-gsi-client';
    let script = document.getElementById(scriptId);

    const initTokenClient = () => {
      if (!window.google?.accounts?.oauth2) return;

      // Initialize OAuth2 Token Client with prompt: 'select_account'
      // This FORCES Google to always show the email/account selection popup
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'email profile openid',
        prompt: 'select_account',
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            setError('Google sign-in was cancelled or encountered an error.');
            setLoading(false);
            return;
          }

          try {
            setLoading(true);
            setError(null);
            await googleLogin({ access_token: tokenResponse.access_token });
            navigate(redirect);
          } catch (err) {
            const status = err.response?.status;
            const detail = err.response?.data?.detail;
            if (status === 403) {
              setError(detail || 'No RiskLens account found for this Google email. Please register first with email & password, then use Google sign-in.');
            } else {
              setError(detail || 'Failed to authenticate with Google.');
            }
          } finally {
            setLoading(false);
          }
        },
      });
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initTokenClient;
      document.body.appendChild(script);
    } else {
      initTokenClient();
    }
  }, [clientId, isConfigured, navigate, redirect, googleLogin]);

  const handleSignInClick = () => {
    setError(null);

    // 1. If Client ID is configured, trigger Google's account selection popup
    if (isConfigured) {
      if (tokenClientRef.current) {
        setLoading(true);
        // prompt: 'select_account' forces Google to prompt the user to choose an account
        tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
      } else if (window.google?.accounts?.id) {
        window.google.accounts.id.prompt();
      } else {
        setError('Google authentication service is loading. Please try again in a moment.');
      }
      return;
    }

    // 2. If Client ID is NOT configured, show the configuration explanation notice
    setShowConfigNotice(true);
  };

  const handleDevContinueWithEmail = async (email, name) => {
    try {
      setLoading(true);
      setError(null);
      await googleLogin(null, { email, name });
      navigate(redirect);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Google Sign In Button */}
      <button
        type="button"
        onClick={handleSignInClick}
        disabled={loading}
        className="w-full py-2.5 px-4 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2.5 transition-all shadow-sm hover:shadow cursor-pointer disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
        ) : (
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
        )}
        <span>
          {loading
            ? 'Waiting for Google account selection...'
            : mode === 'signup'
            ? 'Sign up with Google'
            : 'Sign in with Google'}
        </span>
      </button>

      {/* Notice shown when clicked without Google Client ID configured */}
      {showConfigNotice && !isConfigured && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 animate-fadeIn">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-950">
                  Why didn't Google ask for your email?
                </p>
                <p className="mt-1 text-slate-700">
                  Google's account selection window requires a registered Google Client ID. Currently,{' '}
                  <code className="bg-white px-1 py-0.5 rounded border border-amber-200 text-amber-900 font-mono text-[11px]">
                    VITE_GOOGLE_CLIENT_ID
                  </code>{' '}
                  is not configured in your <code className="font-mono text-slate-800">frontend/.env</code> file.
                </p>
                <div className="mt-2.5 pt-2 border-t border-amber-200/80 flex items-center gap-2">
                  <span className="text-[11px] text-slate-600">For instant local testing:</span>
                  <button
                    type="button"
                    onClick={() => handleDevContinueWithEmail('user.google@gmail.com', 'Google User')}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 underline cursor-pointer"
                  >
                    Continue as Test Google Account
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowConfigNotice(false)}
              className="text-amber-500 hover:text-amber-700 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleSignInButton;
