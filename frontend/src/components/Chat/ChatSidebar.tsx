/**
 * @component ChatSidebar
 * @description 会话侧边栏组件，负责展示会话列表、重命名、删除、置顶和登录入口
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-10
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CirclePlus,
  Edit2,
  HelpCircle,
  LogOut,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  Pin,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import classNames from 'classnames';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { extractApiErrorMessage, logoutAuthSession, sessionApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import type { AuthUser, SessionItem } from '../../types/api';
import styles from './ChatSidebar.module.scss';
import DeepXinjieLogo from '../DeepXinjieLogo';
import LoginModal from '../commons/LoginModal';
import Modal from '../commons/Modal';

interface ChatSidebarProps {
  /** 移动端侧边栏是否展开 */
  isOpen: boolean;
  /** 关闭侧边栏 */
  onClose: () => void;
  /** 桌面端切换折叠 */
  onToggleCollapse: () => void;
}

type ToastType = 'info' | 'success' | 'error';

interface ToastState {
  /** 提示文案 */
  message: string;
  /** 提示类型 */
  type: ToastType;
}

const AVATAR_GRADIENTS: readonly [string, string][] = [
  ['#2563eb', '#60a5fa'],
  ['#0891b2', '#22d3ee'],
  ['#7c3aed', '#a78bfa'],
  ['#ea580c', '#fb923c'],
  ['#db2777', '#f472b6'],
  ['#059669', '#34d399'],
];

/**
 * 基于昵称生成稳定哈希，用于映射默认头像颜色。
 * @param text - 输入文本
 * @returns 稳定非负整数
 */
const getStableHash = (text: string): number => {
  let hash = 0;

  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
};

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
 * @param nickname - 用户昵称
 * @returns 头像背景样式
 */
const getAvatarStyle = (nickname: string): React.CSSProperties => {
  const gradientIndex = getStableHash(nickname) % AVATAR_GRADIENTS.length;
  const [startColor, endColor] = AVATAR_GRADIENTS[gradientIndex];

  return {
    background: `linear-gradient(135deg, ${startColor} 0%, ${endColor} 100%)`,
  };
};

const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onClose, onToggleCollapse }) => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const { theme, toggleTheme } = useThemeStore();

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
    try {
      const response = await sessionApi.list();
      if (response.data.success) {
        setSessions(response.data.data.sessions);
        return;
      }

      showToast(response.data.message, 'error');
    } catch (error) {
      showToast(extractApiErrorMessage(error), 'error');
    }
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }

      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      return;
    }

    void fetchSessions();
  }, [fetchSessions, location.pathname, user]);

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

      if (currentSessionId === id.toString()) {
        navigate('/');
      }

      setDeleteConfirmId(null);
      showToast('删除成功', 'success');
      await fetchSessions();
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
   * 退出登录。
   */
  const handleLogout = async () => {
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
    const last30Days: SessionItem[] = [];
    const older: SessionItem[] = [];

    const now = new Date();
    const todayKey = now.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

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
      } else if (updatedAt > thirtyDaysAgo) {
        last30Days.push(session);
      } else {
        older.push(session);
      }
    });

    return { pinned, today, last7Days, last30Days, older };
  }, [sessions]);

  const { pinned, today, last7Days, last30Days, older } = groupSessions();

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
      <div className={classNames(styles.overlay, { [styles.visible]: isOpen })} onClick={onClose} />

      <div className={classNames(styles.sidebar, { [styles.open]: isOpen })}>
        <div className={styles.header}>
          <div className={styles.logo} onClick={() => navigate('/')}>
            <DeepXinjieLogo size={28} />
            <span className={styles.logoText}>DeepXinjie</span>
          </div>

          <div className={styles.headerActions}>
            <button className={styles.collapseBtn} onClick={onToggleCollapse} title="收起侧边栏">
              <PanelLeftClose size={20} strokeWidth={1.5} />
            </button>
            <button className={styles.closeBtn} onClick={onClose} title="关闭侧边栏">
              <X size={24} strokeWidth={1.5} />
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

          {last30Days.length > 0 && (
            <div className={styles.historyGroup}>
              <div className={styles.historyLabel}>30 天内</div>
              {last30Days.map(renderSessionItem)}
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
              <div className={styles.userMenuItem}>
                <HelpCircle size={18} strokeWidth={1.5} />
                <span>帮助与反馈</span>
              </div>
              <div className={classNames(styles.userMenuItem, styles.logout)} onClick={handleLogout}>
                <LogOut size={18} strokeWidth={1.5} />
                <span>退出登录</span>
              </div>
            </div>
          )}
        </div>

        {toast && <div className={classNames(styles.toast, styles[toast.type])}>{toast.message}</div>}

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

        <LoginModal
          visible={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSuccess={handleLoginSuccess}
        />
      </div>
    </>
  );
};

export default ChatSidebar;
