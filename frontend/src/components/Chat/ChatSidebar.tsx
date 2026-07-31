/**
 * @component ChatSidebar
 * @description 会话侧边栏组件，负责展示会话列表、重命名、删除、置顶和登录入口
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-07-30
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CirclePlus,
  Edit2,
  FileText,
  LogOut,
  Moon,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  Pin,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import classNames from 'classnames';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { extractApiErrorMessage, logoutAuthSession, sessionApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useSessionStore } from '../../store/sessionStore';
import { useThemeStore } from '../../store/themeStore';
import type { AuthUser, SessionItem } from '../../types/api';
import { getCachedSessions, cacheSessions, deleteCachedSession, deleteCachedMessagesBySession } from '../../services/localCache';
import styles from './ChatSidebar.module.scss';
import ChatSearchDialog from './ChatSearchDialog';
import DeepXinjieLogo from '../DeepXinjieLogo';
import LoginModal from '../commons/LoginModal';
import Modal from '../commons/Modal';
import Toast, { type ToastType } from '../commons/Toast';

interface ChatSidebarProps {
  /** 移动端侧边栏是否展开 */
  isOpen: boolean;
  showOverlay: boolean;
  /** 关闭侧边栏 */
  onClose: () => void;
  /** 桌面端切换折叠 */
  onToggleCollapse: () => void;
}

interface ToastState {
  /** 提示文案 */
  message: string;
  /** 提示类型 */
  type: ToastType;
}

/**
 * 获取默认头像显示字符。
 * @param nickname - 用户昵称
 * @returns 默认头像字符
 */
const getAvatarInitial = (nickname: string): string => {
  const normalizedName = nickname.trim();

  if (!normalizedName) {
    return '用';
  }

  return Array.from(normalizedName)[0]?.toUpperCase() || '用';
};

/**
 * 获取默认头像渐变样式。
 * @param _nickname - 用户昵称（保留参数，保持接口兼容）
 * @returns 头像背景样式
 */
const getAvatarStyle = (_nickname: string): React.CSSProperties => {
  return {
    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-active) 100%)',
  };
};

const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, showOverlay, onClose, onToggleCollapse }) => {
  const sessions = useSessionStore((state) => state.sessions);
  const setSessions = useSessionStore((state) => state.setSessions);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { theme, toggleTheme, colorScheme, setColorScheme } = useThemeStore();

  const pathParts = location.pathname.split('/');
  const currentSessionId = pathParts[1] === 'chat' ? pathParts[2] : undefined;

  /**
   * 显示提示信息。
   * @param message - 提示文案
   * @param type - 提示类型
   */
  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  /**
   * 获取会话列表。
   */
  const fetchSessions = useCallback(async () => {
    // 优先从本地缓存秒级渲染会话列表
    if (user) {
      try {
        const cached = await getCachedSessions(user.id);
        if (cached.length > 0) {
          setSessions(cached);
        }
      } catch {
        // 本地读取失败不影响网络同步
      }
    }

    try {
      const response = await sessionApi.list();
      if (response.data.success) {
        setSessions(response.data.data.sessions);
        if (user) {
          void cacheSessions(user.id, response.data.data.sessions);
        }
        return;
      }

      showToast(response.data.message, 'error');
    } catch (error) {
      showToast(extractApiErrorMessage(error), 'error');
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }

      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      return;
    }

    void fetchSessions();
  }, [fetchSessions, user]);

  /**
   * 新建会话。
   */
  const handleNewChat = () => {
    navigate('/');
    if (window.innerWidth <= 750) {
      onClose();
    }
  };

  /**
   * 重命名会话。
   * @param id - 会话 ID
   */
  const handleRename = async (id: number) => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      showToast('标题不能为空', 'error');
      return;
    }

    try {
      const response = await sessionApi.rename(id, nextTitle);
      if (!response.data.success) {
        showToast(response.data.message, 'error');
        return;
      }

      setEditingId(null);
      showToast('重命名成功', 'success');
      await fetchSessions();
    } catch (error) {
      showToast(extractApiErrorMessage(error), 'error');
    }
  };

  /**
   * 删除会话。
   * @param id - 会话 ID
   */
  const handleDelete = async (id: number) => {
    try {
      const response = await sessionApi.delete(id);
      if (!response.data.success) {
        showToast(response.data.message, 'error');
        return;
      }

      // 接口删除成功后立即同步：先同步更新内存列表（用户无感知），再立即同步本地 IndexedDB
      setSessions(sessions.filter((session) => session.id !== id));
      if (user) {
        await deleteCachedSession(id);
        // 一并清理该会话的本地消息，避免 IndexedDB 残留孤儿记录
        await deleteCachedMessagesBySession(id);
      }

      if (currentSessionId === id.toString()) {
        navigate('/');
      }

      setDeleteConfirmId(null);
      showToast('删除成功', 'success');
      // 后台静默重新拉取，保证与服务器最终一致（此时本地已无该项，不会闪烁）
      void fetchSessions();
    } catch (error) {
      showToast(extractApiErrorMessage(error), 'error');
    }
  };

  /**
   * 切换会话置顶状态。
   * @param id - 会话 ID
   */
  const handlePin = async (id: number) => {
    try {
      const response = await sessionApi.pin(id);
      if (!response.data.success) {
        showToast(response.data.message, 'error');
        return;
      }

      setMenuOpenId(null);
      showToast('操作成功', 'success');
      await fetchSessions();
    } catch (error) {
      showToast(extractApiErrorMessage(error), 'error');
    }
  };

  /**
   * 进入重命名状态。
   * @param session - 当前会话
   */
  const startEditing = (session: SessionItem) => {
    setEditingId(session.id);
    setEditTitle(session.title);
    setMenuOpenId(null);
  };

  /**
   * 切换单个会话菜单显示状态。
   * @param event - 点击事件
   * @param id - 会话 ID
   */
  const toggleMenu = (event: React.MouseEvent, id: number) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpenId((prev) => (prev === id ? null : id));
  };

  /**
   * 退出登录，需用户二次确认。
   */
  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  /**
   * 确认退出登录，执行清除会话并跳转。
   */
  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    await logoutAuthSession();
    setUserMenuOpen(false);
    setSessions([]);
    showToast('已退出登录', 'success');
    navigate('/login');
  };

  /**
   * 登录成功后同步会话列表。
   */
  const handleLoginSuccess = () => {
    setShowLoginModal(false);
    showToast('登录成功', 'success');
    void fetchSessions();
  };

  /**
   * 按更新时间分组会话。
   * @returns 分组后的会话集合
   */
  const groupSessions = useCallback(() => {
    const pinned: SessionItem[] = [];
    const today: SessionItem[] = [];
    const last7Days: SessionItem[] = [];
    const older: SessionItem[] = [];

    const now = new Date();
    const todayKey = now.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    sessions.forEach((session) => {
      if (session.is_pinned) {
        pinned.push(session);
        return;
      }

      const updatedAt = new Date(session.update_time);
      const updatedAtKey = updatedAt.toISOString().split('T')[0];

      if (updatedAtKey === todayKey) {
        today.push(session);
      } else if (updatedAt > sevenDaysAgo) {
        last7Days.push(session);
      } else {
        older.push(session);
      }
    });

    return { pinned, today, last7Days, older };
  }, [sessions]);

  // groupSessions 仅在 sessions 变化时重算，用 useMemo 缓存其结果，避免每次渲染重复遍历分组
  const { pinned, today, last7Days, older } = useMemo(() => groupSessions(), [groupSessions]);

  /**
   * 渲染用户头像。
   * @param currentUser - 当前登录用户
   * @returns 头像节点
   */
  const renderAvatar = (currentUser: AuthUser) => {
    if (currentUser.avatar) {
      return <img src={currentUser.avatar} alt="avatar" />;
    }

    return (
      <span
        className={styles.avatarFallback}
        style={getAvatarStyle(currentUser.nickname)}
      >
        {getAvatarInitial(currentUser.nickname)}
      </span>
    );
  };

  /**
   * 渲染单个会话项。
   * @param session - 会话数据
   * @returns 会话节点
   */
  const renderSessionItem = (session: SessionItem) => {
    const isActive = currentSessionId === session.id.toString();
    const isEditingCurrent = editingId === session.id;
    const isMenuOpen = menuOpenId === session.id;

    if (isEditingCurrent) {
      return (
        <div className={classNames(styles.historyItem, styles.editing)} key={session.id}>
          <input
            autoFocus
            className={styles.editInput}
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            onBlur={() => void handleRename(session.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleRename(session.id);
              }

              if (event.key === 'Escape') {
                setEditingId(null);
              }
            }}
          />
          <div className={styles.editActions}>
            <Check size={14} onClick={() => void handleRename(session.id)} />
            <X size={14} onClick={() => setEditingId(null)} />
          </div>
        </div>
      );
    }

    return (
      <div className={styles.historyItemWrapper} key={session.id}>
        <Link
          to={`/chat/${session.id}`}
          className={classNames(styles.historyItem, { [styles.active]: isActive })}
          onClick={() => {
            if (window.innerWidth <= 750) {
              onClose();
            }
          }}
        >
          <span className={styles.sessionTitle}>{session.title}</span>
          <div className={styles.itemActions}>
            <div
              className={classNames(styles.moreIconBtn, { [styles.menuOpen]: isMenuOpen })}
              onClick={(event) => toggleMenu(event, session.id)}
            >
              <MoreHorizontal size={16} className={styles.moreIcon} />
            </div>
          </div>
        </Link>

        {isMenuOpen && (
          <div className={styles.dropdownMenu} ref={menuRef}>
            <div className={styles.menuItem} onClick={() => startEditing(session)}>
              <Edit2 size={16} />
              <span>重命名</span>
            </div>
            <div className={styles.menuItem} onClick={() => void handlePin(session.id)}>
              <Pin size={16} />
              <span>{session.is_pinned ? '取消置顶' : '置顶'}</span>
            </div>
            <div
              className={classNames(styles.menuItem, styles.delete)}
              onClick={() => {
                setDeleteConfirmId(session.id);
                setMenuOpenId(null);
              }}
            >
              <Trash2 size={16} />
              <span>删除</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {showOverlay && (
        <div
          className={classNames(styles.overlay, styles.blocking, { [styles.visible]: isOpen })}
          onClick={onClose}
        />
      )}

      <div className={classNames(styles.sidebar, { [styles.open]: isOpen })}>
        <div className={styles.header}>
          <div className={styles.logo} onClick={() => navigate('/')}>
            <DeepXinjieLogo size={28} />
            <span className={styles.logoText}>DeepXinjie</span>
          </div>

          <div className={styles.headerActions}>
            <button className={styles.searchBtn} onClick={() => setShowSearch(true)} title="搜索对话内容">
              <Search size={20} strokeWidth={1.5} />
            </button>
            <button className={styles.collapseBtn} onClick={onToggleCollapse} title="收起侧边栏">
              <PanelLeftClose size={20} strokeWidth={1.5} />
            </button>
            <button className={styles.closeBtn} onClick={onClose} title="关闭侧边栏">
              <PanelLeftClose size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <button className={styles.newChatBtn} onClick={handleNewChat}>
          <CirclePlus size={20} strokeWidth={1.5} />
          <span>开启新对话</span>
        </button>

        <div className={styles.history}>
          {pinned.length > 0 && (
            <div className={styles.historyGroup}>
              <div className={styles.historyLabel}>置顶</div>
              {pinned.map(renderSessionItem)}
            </div>
          )}

          {today.length > 0 && (
            <div className={styles.historyGroup}>
              <div className={styles.historyLabel}>今天</div>
              {today.map(renderSessionItem)}
            </div>
          )}

          {last7Days.length > 0 && (
            <div className={styles.historyGroup}>
              <div className={styles.historyLabel}>7 天内</div>
              {last7Days.map(renderSessionItem)}
            </div>
          )}

          {older.length > 0 && (
            <div className={styles.historyGroup}>
              <div className={styles.historyLabel}>更早</div>
              {older.map(renderSessionItem)}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {user ? (
            <div className={styles.userProfile} onClick={() => setUserMenuOpen((prev) => !prev)}>
              <div className={styles.avatar}>{renderAvatar(user)}</div>
              <span className={styles.username}>{user.nickname}</span>
              <div
                className={styles.themeToggle}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTheme();
                }}
                title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
              >
                {theme === 'light' ? (
                  <Moon size={16} strokeWidth={1.5} />
                ) : (
                  <Sun size={16} strokeWidth={1.5} />
                )}
              </div>


            </div>
          ) : (
            <div className={styles.loginBtnWrapper}>
              <button className={styles.loginBtn} onClick={() => setShowLoginModal(true)}>
                <span>登录</span>
              </button>
            </div>
          )}

          {user && userMenuOpen && (
            <div className={styles.userMenu} ref={userMenuRef}>
              <div className={styles.userMenuItem}>
                <Settings size={18} strokeWidth={1.5} />
                <span>系统设置</span>
              </div>
              <div
                className={styles.userMenuItem}
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate('/agreement?type=user');
                }}
              >
                <FileText size={18} strokeWidth={1.5} />
                <span>协议与隐私</span>
              </div>

              {/* 主色方案切换：以菜单项形式呈现 */}
              <div
                className={classNames(styles.userMenuItem, styles.colorSchemeMenuItem)}
                onClick={(event) => event.stopPropagation()}
              >
                <Palette size={18} strokeWidth={1.5} />
                <span>主题色</span>
                <div
                  className={styles.userMenuSwatches}
                  role="group"
                  aria-label="主色方案切换"
                >
                  <button
                    type="button"
                    className={classNames(styles.userMenuSwatch, {
                      [styles.userMenuSwatchActive]: colorScheme === 'blue',
                    })}
                    style={{ '--swatch-color': '#4d6bfe' } as React.CSSProperties}
                    onClick={() => {
                      setColorScheme('blue');
                      showToast('已切换为蓝色主题', 'info');
                    }}
                    title="蓝色调（经典）"
                    aria-label="切换到蓝色主色"
                    aria-pressed={colorScheme === 'blue'}
                  />
                  <button
                    type="button"
                    className={classNames(styles.userMenuSwatch, {
                      [styles.userMenuSwatchActive]: colorScheme === 'green',
                    })}
                    style={{ '--swatch-color': '#16915f' } as React.CSSProperties}
                    onClick={() => {
                      setColorScheme('green');
                      showToast('已切换为绿色主题', 'info');
                    }}
                    title="绿色调（默认）"
                    aria-label="切换到绿色主色"
                    aria-pressed={colorScheme === 'green'}
                  />
                </div>
              </div>

              <div className={classNames(styles.userMenuItem, styles.logout)} onClick={handleLogout}>
                <LogOut size={18} strokeWidth={1.5} />
                <span>退出登录</span>
              </div>
            </div>
          )}
        </div>

        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

        <Modal
          visible={deleteConfirmId !== null}
          title="删除对话"
          content="确定要删除这个对话吗？此操作不可撤销。"
          confirmText="删除"
          danger={true}
          onConfirm={() => {
            if (deleteConfirmId !== null) {
              void handleDelete(deleteConfirmId);
            }
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />

        <Modal
          visible={showLogoutConfirm}
          title="退出登录"
          content="确定要退出登录吗？"
          confirmText="退出"
          onConfirm={() => { void confirmLogout(); }}
          onCancel={() => setShowLogoutConfirm(false)}
        />

        <LoginModal
          visible={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSuccess={handleLoginSuccess}
        />

        <ChatSearchDialog
          open={showSearch}
          onOpenChange={setShowSearch}
          onCloseSidebar={() => {
            if (window.innerWidth <= 750) {
              onClose();
            }
          }}
        />
      </div>
    </>
  );
};

export default ChatSidebar;
