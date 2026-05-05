import { useState, useEffect } from 'react';
import Header from './components/Header.tsx';
import { Icon } from './components/Icon.tsx';
import Search from './pages/Search.tsx';
import Admin from './pages/Admin.tsx';
import AdminLogin from './pages/AdminLogin.tsx';

type Tab = 'search' | 'admin';

export default function App() {
  const [tab, setTab] = useState<Tab>('search');
  const [sessionActive, setSessionActive] = useState(() => !!localStorage.getItem('first-chair.sessionId'));
  const [adminUser, setAdminUser] = useState<{ username: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('first-chair.theme');
    return (stored === 'dark' ? 'dark' : 'light') as 'light' | 'dark';
  });

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('first-chair.theme', theme);
  }, [theme]);

  // Cmd+K shortcut focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setTab('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setTheme = (t: 'light' | 'dark') => setThemeState(t);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <>
      <Header
        tab={tab}
        setTab={setTab}
        sessionActive={sessionActive}
        onConnect={() => setSessionActive(true)}
        onDisconnect={() => setSessionActive(false)}
        theme={theme}
        setTheme={setTheme}
        adminUser={adminUser}
        onSignOut={() => {
          setAdminUser(null);
          setTab('search');
          showToast('Signed out');
        }}
      />
      {tab === 'search' && <Search sessionActive={sessionActive} />}
      {tab === 'admin' && !adminUser && (
        <AdminLogin
          onLogin={(u) => {
            setAdminUser(u);
            showToast(`Welcome, ${u.username}`);
          }}
        />
      )}
      {tab === 'admin' && adminUser && <Admin onSaved={showToast} />}
      <div className="toast-wrap">
        {toast && (
          <div className="toast">
            <span className="check">
              <Icon name="check" size={11} stroke={2.4} />
            </span>
            {toast}
          </div>
        )}
      </div>
    </>
  );
}
