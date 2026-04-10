import { create } from 'zustand';

import type { AuthUser } from '../types/api';

/**
 * 登录态状态定义。
 */
interface AuthState {
  /** 短效 Access Token */
  accessToken: string | null;
  /** 当前登录用户 */
  user: AuthUser | null;
  /** 是否已经完成启动阶段校验 */
  initialized: boolean;
  /** 是否正在执行启动恢复 */
  bootstrapping: boolean;
  /** 是否处于已登录状态 */
  isAuthenticated: boolean;
  /** 设置当前登录会话 */
  setSession: (accessToken: string, user: AuthUser) => void;
  /** 清理当前登录会话 */
  clearSession: () => void;
  /** 更新启动恢复状态 */
  setBootstrapping: (bootstrapping: boolean) => void;
  /** 更新初始化完成状态 */
  setInitialized: (initialized: boolean) => void;
}

/**
 * 登录态全局状态。
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  initialized: false,
  bootstrapping: false,
  isAuthenticated: false,
  setSession: (accessToken: string, user: AuthUser) =>
    set({
      accessToken,
      user,
      isAuthenticated: true,
      initialized: true,
    }),
  clearSession: () =>
    set({
      accessToken: null,
      user: null,
      isAuthenticated: false,
    }),
  setBootstrapping: (bootstrapping: boolean) => set({ bootstrapping }),
  setInitialized: (initialized: boolean) => set({ initialized }),
}));
