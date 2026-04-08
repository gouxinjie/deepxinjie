/**
 * @component Layout
 * @description 页面整体布局组件，负责侧边栏、移动端头部与主内容区域布局切换
 * @author gouxinjie
 * @created 2026-04-08
 * @updated 2026-04-08
 */
import React from "react";
import type { ReactNode } from "react";
import styles from "./Layout.module.scss";
import { Menu, PanelLeftOpen, Plus, Share2, CirclePlus } from "lucide-react";
import classNames from "classnames";
import DeepXinjieLogo from "../DeepXinjieLogo";
import { useNavigate } from "react-router-dom";
import useMobile from "../../hooks/useMobile";

interface LayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
  onToggleSidebar: () => void;
  onToggleCollapse: () => void;
  isCollapsed: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, sidebar, onToggleSidebar, onToggleCollapse, isCollapsed }) => {
  const navigate = useNavigate();
  const isMobile = useMobile();

  // 渲染移动端顶部导航栏
  const renderMobileHeader = () => (
    <div className={styles.mobileHeader}>
      <button className={styles.iconBtn} onClick={onToggleSidebar}>
        <Menu size={24} strokeWidth={1.5} />
      </button>
      <div className={styles.mobileActions}>
        <button className={styles.iconBtn} onClick={() => navigate("/")}>
          <CirclePlus size={24} strokeWidth={1.5} />
        </button>
        <button className={styles.iconBtn}>
          <Share2 size={24} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={classNames(styles.container, { [styles.collapsed]: isCollapsed, [styles.mobile]: isMobile })}>
      <div className={classNames(styles.sidebarWrapper, { [styles.hidden]: isCollapsed })}>{sidebar}</div>
      <div className={styles.main}>
        {isMobile && renderMobileHeader()}

        {/* 桌面端折叠状态下的浮动按钮 */}
        {!isMobile && isCollapsed && (
          <div className={styles.floatingHeader}>
            <div className={styles.logoIcon} onClick={() => navigate("/")}>
              <DeepXinjieLogo size={24} />
            </div>
            <div className={styles.floatingActions}>
              <button className={styles.expandBtn} onClick={onToggleCollapse} title="展开侧边栏">
                <PanelLeftOpen size={20} />
              </button>
              <button className={styles.newChatBtn} onClick={() => navigate("/")} title="开启新对话">
                <Plus size={20} />
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
