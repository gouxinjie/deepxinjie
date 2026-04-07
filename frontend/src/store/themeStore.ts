import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 主题类型定义
 */
export type Theme = 'light' | 'dark';

/**
 * 主题状态定义
 */
interface ThemeState {
  /** 当前主题 */
  theme: Theme;
  /** 切换主题 */
  toggleTheme: () => void;
  /** 设置主题 */
  setTheme: (theme: Theme) => void;
}

/**
 * 主题状态管理商店
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme: Theme) => set({ theme }),
    }),
    {
      name: 'theme-storage',
    }
  )
);
