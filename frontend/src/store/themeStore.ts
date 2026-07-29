import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 主题类型定义（浅色 / 深色）
 */
export type Theme = 'light' | 'dark';

/**
 * 主色方案类型定义：blue 为原有蓝色调，green 为新增绿色调（默认）
 */
export type ColorScheme = 'blue' | 'green';

/**
 * 主题状态定义
 */
interface ThemeState {
  /** 当前主题（浅色 / 深色） */
  theme: Theme;
  /** 当前主色方案（蓝色 / 绿色） */
  colorScheme: ColorScheme;
  /** 切换明暗主题 */
  toggleTheme: () => void;
  /** 设置明暗主题 */
  setTheme: (theme: Theme) => void;
  /** 设置主色方案 */
  setColorScheme: (scheme: ColorScheme) => void;
  /** 在蓝色与绿色主色方案之间切换 */
  toggleColorScheme: () => void;
}

/**
 * 主题状态管理商店
 * 通过 persist 中间件将偏好持久化到本地存储，刷新后保持
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      colorScheme: 'green',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme: Theme) => set({ theme }),
      setColorScheme: (colorScheme: ColorScheme) => set({ colorScheme }),
      toggleColorScheme: () =>
        set((state) => ({ colorScheme: state.colorScheme === 'blue' ? 'green' : 'blue' })),
    }),
    {
      name: 'theme-storage',
    }
  )
);
