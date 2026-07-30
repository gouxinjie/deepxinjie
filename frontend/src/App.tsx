import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import styles from './App.module.scss';
import useMobile from './hooks/useMobile';
import { initializeAuthSession } from './services/api';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';

// 路由级组件按需懒加载：拆分 react-markdown / mermaid / rehype-highlight 等重型依赖，缩小首屏 JS 体积
const ChatMain = lazy(() => import('./components/Chat/ChatMain'));
const ChatSidebar = lazy(() => import('./components/Chat/ChatSidebar'));
const Layout = lazy(() => import('./components/Layout/Layout'));
const LoginPage = lazy(() => import('./pages/Login'));
const AgreementPage = lazy(() => import('./pages/Agreement'));

const MOBILE_SIDEBAR_TRANSITION_MS = 300;

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarLayerActive, setIsSidebarLayerActive] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme, colorScheme } = useThemeStore();
  const location = useLocation();
  const isMobile = useMobile();
  const initialized = useAuthStore((state) => state.initialized);
  const bootstrapping = useAuthStore((state) => state.bootstrapping);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  /**
   * 同步明暗主题到根节点。
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /**
   * 同步主色方案（蓝色 / 绿色）到根节点，驱动全局主色切换。
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', colorScheme);
  }, [colorScheme]);

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

  // 协议页为公开页面，不依赖登录态，优先于登录态判断直接渲染
  if (location.pathname.startsWith('/agreement')) {
    return (
      <Suspense fallback={<div className={styles.app} />}>
        <AgreementPage />
      </Suspense>
    );
  }

  if (!initialized || bootstrapping) {
    return <div className={styles.app} />;
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense fallback={<div className={styles.app} />}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  return (
    <Suspense fallback={<div className={styles.app} />}>
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
                  isCollapsed={isCollapsed}
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
                  isCollapsed={isCollapsed}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </div>
    </Suspense>
  );
}

export default App;
