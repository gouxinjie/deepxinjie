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
import { useNavigate } from 'react-router-dom';

import DeepXinjieLogo from '../DeepXinjieLogo';
import useMobile from '../../hooks/useMobile';
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
  const isMobile = useMobile();
  const isMobileSidebarHidden = isMobile && !isSidebarInteractive;

  /**
   * 渲染移动端顶部导航栏。
   * @returns 移动端头部节点
   */
  const renderMobileHeader = () => (
    <div className={styles.mobileHeader}>
      <button className={styles.iconBtn} onClick={onToggleSidebar}>
        <Menu size={24} strokeWidth={1.5} />
      </button>
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
              <button className={styles.newChatBtn} onClick={() => navigate('/')} title="开启新对话">
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
