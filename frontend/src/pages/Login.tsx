import { getApiErrorMessage } from '../services/http';
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const REDIRECT_URI = `${window.location.origin}/auth/callback`;
const MAGIC_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_MAGIC_LOGIN === 'true';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, magicLogin, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (code) handleGoogleCallback(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const handleGoogleCallback = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.googleAuth(code, REDIRECT_URI);
      login(response.access_token, response.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Login failed. Please try again.'));
      window.history.replaceState({}, document.title, '/login');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Google OAuth is not configured. Missing client ID.');
      return;
    }
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    })}`;
    window.location.href = authUrl;
  };

  const handleMagicLogin = () => {
    magicLogin();
    navigate('/dashboard');
  };

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center relative"
      style={{ backgroundImage: "url('/brand/Stellina-site-selection-company-1.jpg')" }}
    >
      {/* Dark overlay for legibility — same teal-gray as the brand */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#3e555c]/55 via-[#3e555c]/35 to-[#3e555c]/70" />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top: logo */}
        <header className="pt-10 sm:pt-14 px-6 flex justify-center">
          <img
            src="/brand/stellina-logo-white.png"
            alt="Stellina Connections"
            className="h-24 sm:h-32 lg:h-36 w-auto drop-shadow-lg"
          />
        </header>

        {/* Center: login card */}
        <main className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-md bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 sm:p-10">
            <div className="text-center mb-7">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
                Admin Console
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                For members of the Stellina Connections team only.
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="text-gray-700 font-medium">Signing in…</span>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span className="text-gray-700 font-medium">Sign in with Google</span>
                </>
              )}
            </button>

            {MAGIC_LOGIN_ENABLED && (
              <button
                type="button"
                onClick={handleMagicLogin}
                disabled={loading}
                className="mt-3 w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#3e555c] text-white rounded-lg hover:bg-[#31464d] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="font-medium">Magic Login</span>
              </button>
            )}

            <p className="mt-6 text-center text-xs text-gray-400">
              Access requires an approved Stellina Connections account.
            </p>
          </div>
        </main>

        <footer className="pb-6 text-center text-xs text-white/70">
          © Stellina Connections · A Site Selection Company
        </footer>
      </div>
    </div>
  );
};

export default Login;
