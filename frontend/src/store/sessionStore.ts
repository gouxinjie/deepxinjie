/**
 * @description 会话列表跨组件共享状态
 * @author gouxinjie
 * @created 2026-07-29
 * @updated 2026-07-29
 */

import { create } from 'zustand';
import type { SessionItem } from '../types/api';

interface SessionStore {
  /** 会话列表 */
  sessions: SessionItem[];
  /** 设置完整会话列表 */
  setSessions: (sessions: SessionItem[]) => void;
  /** 新建会话后插入列表顶部，使侧边栏即时展示 */
  addSession: (session: SessionItem) => void;
  /** 更新指定会话的标题（AI 自动生成标题时使用） */
  updateSessionTitle: (sessionId: number, title: string) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  // 插入新会话：若已存在则跳过，避免重复；始终保持最新会话在顶部
  addSession: (session) =>
    set((state) => {
      if (state.sessions.some((item) => item.id === session.id)) {
        return state;
      }

      return { sessions: [session, ...state.sessions] };
    }),
  updateSessionTitle: (sessionId, title) =>
    set((state) => ({
      sessions: state.sessions.map((item) =>
        item.id === sessionId ? { ...item, title } : item,
      ),
    })),
}));
