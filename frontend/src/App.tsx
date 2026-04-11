import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import ChatMain from './components/Chat/ChatMain';
import ChatSidebar from './components/Chat/ChatSidebar';
import Layout from './components/Layout/Layout';
import styles from './App.module.scss';
import useMobile from './hooks/useMobile';
import LoginPage from './pages/Login';
import { initializeAuthSession } from './services/api';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';

const MOBILE_SIDEBAR_TRANSITION_MS = 300;

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarLayerActive, setIsSidebarLayerActive] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme } = useThemeStore();
  const location = useLocation();
  const isMobile = useMobile();
  const initialized = useAuthStore((state) => state.initialized);
  const bootstrapping = useAuthStore((state) => state.bootstrapping);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  /**
   * 同步主题到根节点。
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /**
   * 应用启动时恢复登录态。
   */
  useEffect(() => {
    void initializeAuthSession();
  }, []);

  /**
   * 从本地存储恢复聊天开关状态。
   */
  const [isDeepThink, setIsDeepThink] = useState(() => localStorage.getItem('isDeepThink') === 'true');
  const [isSearch, setIsSearch] = useState(() => localStorage.getItem('isSearch') === 'true');

  /**
   * 持久化深度思考与联网搜索状态。
   */
  useEffect(() => {
    localStorage.setItem('isDeepThink', isDeepThink.toString());
  }, [isDeepThink]);

  useEffect(() => {
    localStorage.setItem('isSearch', isSearch.toString());
  }, [isSearch]);

  /**
   * 管理移动端侧边栏交互层生命周期，避免关闭动画期间点击穿透。
   */
  useEffect(() => {
    if (!isMobile) {
      setIsSidebarLayerActive(false);
      return undefined;
    }

    if (isSidebarOpen) {
      setIsSidebarLayerActive(true);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIsSidebarLayerActive(false);
    }, MOBILE_SIDEBAR_TRANSITION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isMobile, isSidebarOpen]);

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
            showOverlay={isMobile && isSidebarLayerActive}
            onClose={() => setIsSidebarOpen(false)}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          />
        }
        isSidebarInteractive={isMobile ? isSidebarLayerActive : true}
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
