import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import ChatMain from './components/Chat/ChatMain';
import ChatSidebar from './components/Chat/ChatSidebar';
import Layout from './components/Layout/Layout';
import styles from './App.module.scss';
import LoginPage from './pages/Login';
import { initializeAuthSession } from './services/api';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme } = useThemeStore();
  const location = useLocation();
  const initialized = useAuthStore((state) => state.initialized);
  const bootstrapping = useAuthStore((state) => state.bootstrapping);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  /**
   * 监听主题变化并同步到 html 标签。
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /**
   * 应用启动时尝试从 Refresh Token 恢复登录态。
   */
  useEffect(() => {
    void initializeAuthSession();
  }, []);

  /**
   * 从 localStorage 加载初始状态，如果没有则默认为 false。
   */
  const [isDeepThink, setIsDeepThink] = useState(() => localStorage.getItem('isDeepThink') === 'true');
  const [isSearch, setIsSearch] = useState(() => localStorage.getItem('isSearch') === 'true');

  /**
   * 持久化深度思考和联网搜索状态。
   */
  useEffect(() => {
    localStorage.setItem('isDeepThink', isDeepThink.toString());
  }, [isDeepThink]);

  useEffect(() => {
    localStorage.setItem('isSearch', isSearch.toString());
  }, [isSearch]);

  if (!initialized || bootstrapping) {
    return <div className={styles.app} />;
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={styles.app}>
      <Layout
        sidebar={
          <ChatSidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          />
        }
        isCollapsed={isCollapsed}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      >
        <Routes>
          <Route
            path="/"
            element={
              <ChatMain
                isDeepThink={isDeepThink}
                setIsDeepThink={setIsDeepThink}
                isSearch={isSearch}
                setIsSearch={setIsSearch}
              />
            }
          />
          <Route
            path="/chat/:sessionId"
            element={
              <ChatMain
                isDeepThink={isDeepThink}
                setIsDeepThink={setIsDeepThink}
                isSearch={isSearch}
                setIsSearch={setIsSearch}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </div>
  );
}

export default App;
