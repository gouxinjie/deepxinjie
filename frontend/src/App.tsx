import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import styles from './App.module.scss';
import Layout from './components/Layout/Layout';
import ChatSidebar from './components/Chat/ChatSidebar';
import ChatMain from './components/Chat/ChatMain';
import LoginPage from './pages/Login';
import { useThemeStore } from './store/themeStore';

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme } = useThemeStore();

  // 监听主题变化并应用到 html 标签
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  // 从 localStorage 加载初始状态，如果没有则默认为 false
  const [isDeepThink, setIsDeepThink] = useState(() => {
    return localStorage.getItem('isDeepThink') === 'true';
  });
  const [isSearch, setIsSearch] = useState(() => {
    return localStorage.getItem('isSearch') === 'true';
  });

  const location = useLocation();
  const navigate = useNavigate();

  // 持久化深度思考和智能搜索状态
  useEffect(() => {
    localStorage.setItem('isDeepThink', isDeepThink.toString());
  }, [isDeepThink]);

  useEffect(() => {
    localStorage.setItem('isSearch', isSearch.toString());
  }, [isSearch]);

  // 简单的路由守卫
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token && location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [location.pathname, navigate]);

  // 如果是登录页，不渲染 Layout
  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div className={styles.app}>
      <Layout 
        sidebar={<ChatSidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        />}
        isCollapsed={isCollapsed}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      >
        <Routes>
          <Route path="/" element={
            <ChatMain 
              isDeepThink={isDeepThink} 
              setIsDeepThink={setIsDeepThink} 
              isSearch={isSearch} 
              setIsSearch={setIsSearch} 
            />
          } />
          <Route path="/chat/:sessionId" element={
            <ChatMain 
              isDeepThink={isDeepThink} 
              setIsDeepThink={setIsDeepThink} 
              isSearch={isSearch} 
              setIsSearch={setIsSearch} 
            />
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </div>
  );
}

export default App;
