/**
 * @component Layout
 * @description 页面整体布局组件，负责侧边栏、移动端顶部栏与主内容区布局切换
 * @author gouxinjie
 * @created 2026-04-08
 * @updated 2026-04-11
 */
import React from 'react';
import type { ReactNode } from 'react';
import { CirclePlus, Menu, PanelLeftOpen, Plus } from 'lucide-react';
import classNames from 'classnames';
import { useLocation, useNavigate } from 'react-router-dom';

import DeepXinjieLogo from '../DeepXinjieLogo';
import useMobile from '../../hooks/useMobile';
import { useSessionStore } from '../../store/sessionStore';
import styles from './Layout.module.scss';

interface LayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
  isSidebarInteractive: boolean;
  onToggleSidebar: () => void;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  sidebar,
  isSidebarInteractive,
  onToggleSidebar,
  onToggleCollapse,
  isCollapsed,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMobile();
  const isMobileSidebarHidden = isMobile && !isSidebarInteractive;

  /**
   * 从路由路径解析当前会话 id（移动端顶部栏需要展示会话标题）。
   */
  const sessionId = location.pathname.match(/\/chat\/(\d+)/)?.[1] ?? '';
  /**
   * 当前会话标题，用于在移动端顶部栏展示；无匹配时回退为“新会话”。
   */
  const currentSessionTitle = useSessionStore(
    (state) => state.sessions.find((item) => item.id === Number.parseInt(sessionId, 10))?.title ?? ''
  );

  /**
   * 渲染移动端顶部导航栏，包含菜单按钮、会话标题与新对话按钮。
   * @returns 移动端头部节点
   */
  const renderMobileHeader = () => (
    <div className={styles.mobileHeader}>
      <button className={styles.iconBtn} onClick={onToggleSidebar}>
        <Menu size={24} strokeWidth={1.5} />
      </button>
      <div className={styles.mobileTitle}>{currentSessionTitle || '新会话'}</div>
      <div className={styles.mobileActions}>
        <button className={styles.iconBtn} onClick={() => navigate('/')}>
          <CirclePlus size={24} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={classNames(styles.container, { [styles.collapsed]: isCollapsed, [styles.mobile]: isMobile })}>
      <div
        className={classNames(styles.sidebarWrapper, {
          [styles.hidden]: !isMobile && isCollapsed,
          [styles.mobileVisible]: isMobile && isSidebarInteractive,
        })}
        aria-hidden={isMobileSidebarHidden}
        inert={isMobileSidebarHidden}
      >
        {sidebar}
      </div>
      <div className={styles.main}>
        {isMobile && renderMobileHeader()}

        {!isMobile && isCollapsed && (
          <div className={styles.floatingHeader}>
            <div className={styles.logoIcon} onClick={() => navigate('/')}>
              <DeepXinjieLogo size={28} />
            </div>
            <div className={styles.floatingActions}>
              <button className={styles.expandBtn} onClick={onToggleCollapse} title="展开侧边栏">
                <PanelLeftOpen size={19} />
              </button>
              <button className={styles.newChatBtn} onClick={() => navigate('/')} title="新对话">
                <Plus size={19} />
              </button>
            </div>
          </div>
        )}

        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
};

export default Layout;
