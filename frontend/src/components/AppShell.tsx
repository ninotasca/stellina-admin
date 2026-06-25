import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BrandMark from './BrandMark';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Home', end: true },
  { to: '/commissions', label: 'Commission Tracker', end: true },
  { to: '/commissions/list', label: 'Bookings' },
  { to: '/points', label: 'Points Tracker' },
  { to: '/rfps', label: 'RFPs' },
  { to: '/site-selection', label: 'Site Selection' },
];

const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-6">
          {/* Brand */}
          <button onClick={() => navigate('/dashboard')} className="shrink-0 hover:opacity-80 transition-opacity" aria-label="Stellina Connections — Home">
            <BrandMark variant="small" />
          </button>

          <div className="flex-1" />

          {/* Right-aligned nav */}
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Settings menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="Account menu"
            >
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-gray-200"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-600">
                  {(user?.full_name || user?.email || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name || user?.email}</p>
                  {user?.full_name && <p className="text-xs text-gray-500 truncate">{user?.email}</p>}
                  {user?.is_admin && (
                    <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
                      Admin
                    </span>
                  )}
                </div>
                <nav className="py-1">
                  <MenuItem onClick={() => { setMenuOpen(false); navigate('/nimble'); }}>Nimble CRM</MenuItem>
                  <MenuItem onClick={() => { setMenuOpen(false); navigate('/login-attempts'); }}>Access Control</MenuItem>
                  <MenuItem onClick={() => { setMenuOpen(false); navigate('/account'); }}>My Account</MenuItem>
                  <div className="border-t border-gray-100 my-1" />
                  <MenuItem onClick={handleLogout} danger>Log out</MenuItem>
                </nav>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};

const MenuItem: React.FC<{ children: React.ReactNode; onClick: () => void; danger?: boolean }> = ({ children, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'}`}
  >
    {children}
  </button>
);

export default AppShell;
