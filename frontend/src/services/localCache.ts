/**
 * @module services/localCache
 * @description 聊天数据本地缓存业务层：会话、消息、草稿的读写。
 *              按 user_id 命名空间隔离，避免多账号串数据（隐私规范）。
 *              所有函数内部兜底异常，避免本地读写失败影响主流程。
 * @author gouxinjie
 * @created 2026-07-30
 * @updated 2026-07-30
 */
import { getByKey, getAllByIndex, deleteByKey, deleteByIndex, putRecord, putRecords } from '../db/indexedDB';
import type { Message } from '../types/chat';
import type { SessionItem } from '../types/api';

/** 本地缓存的会话记录（对齐 SessionItem，附加命名空间字段） */
interface CachedSession extends SessionItem {
  /** 所属用户 ID，用于多账号隔离 */
  user_id: number;
}

/** 本地缓存的消息记录（对齐 Message，附加命名空间字段） */
interface CachedMessage extends Message {
  /** 所属会话 ID，用于索引查询 */
  session_id: number;
  /** 所属用户 ID，用于多账号隔离 */
  user_id: number;
}

/** 草稿记录（按 用户:会话 复合主键） */
interface CachedDraft {
  /** 复合主键：user_id:session_key */
  key: string;
  user_id: number;
  session_key: string;
  content: string;
  updated_at: number;
}

/** 拼接草稿复合主键 */
const draftKey = (userId: number, sessionKey: string): string => `${userId}:${sessionKey}`;

/**
 * 读取某会话的本地消息（秒级渲染来源）。
 * @param userId - 当前用户 ID
 * @param sessionId - 会话 ID
 * @returns 消息数组（出错时返回空数组）
 */
export async function getCachedMessages(userId: number, sessionId: number): Promise<Message[]> {
  try {
    const list = await getAllByIndex<CachedMessage>('messages', 'by_session', sessionId);
    return list
      .filter((item) => item.user_id === userId)
      .map(({ session_id, user_id, ...rest }) => rest);
  } catch (error) {
    console.warn('读取本地消息缓存失败', error);
    return [];
  }
}

/**
 * 批量写入某会话消息（网络同步后落盘）。
 * @param userId - 当前用户 ID
 * @param sessionId - 会话 ID
 * @param messages - 消息列表
 */
export async function cacheMessages(
  userId: number,
  sessionId: number,
  messages: Message[],
): Promise<void> {
  try {
    // 单连接单事务批量写入，避免逐条 open 连接造成连接数暴涨与事务冲突
    await putRecords(
      'messages',
      messages.map((message) => ({ ...message, session_id: sessionId, user_id: userId })),
    );
  } catch (error) {
    console.warn('写入本地消息缓存失败', error);
  }
}

/**
 * 流式过程中增量更新单条消息（断网/刷新可恢复）。
 * @param userId - 当前用户 ID
 * @param sessionId - 会话 ID
 * @param message - 最新消息内容
 */
export async function upsertMessage(
  userId: number,
  sessionId: number,
  message: Message,
): Promise<void> {
  await cacheMessages(userId, sessionId, [message]);
}

/**
 * 删除单条缓存消息（用于清理临时 UUID 留下的孤儿记录）。
 * @param messageId - 消息 ID
 */
export async function deleteCachedMessage(messageId: string): Promise<void> {
  try {
    await deleteByKey('messages', messageId);
  } catch (error) {
    console.warn('删除本地消息缓存失败', error);
  }
}

/**
 * 读取本地会话列表。
 * @param userId - 当前用户 ID
 * @returns 会话数组（出错时返回空数组）
 */
export async function getCachedSessions(userId: number): Promise<SessionItem[]> {
  try {
    const list = await getAllByIndex<CachedSession>('sessions', 'by_user', userId);
    return list.map(({ user_id, ...rest }) => rest);
  } catch (error) {
    console.warn('读取本地会话缓存失败', error);
    return [];
  }
}

/**
 * 写入会话列表（网络同步后落盘）。
 * @param userId - 当前用户 ID
 * @param sessions - 会话列表
 */
export async function cacheSessions(userId: number, sessions: SessionItem[]): Promise<void> {
  try {
    for (const session of sessions) {
      await putRecord<CachedSession>('sessions', { ...session, user_id: userId });
    }
  } catch (error) {
    console.warn('写入本地会话缓存失败', error);
  }
}

/**
 * 删除单条缓存会话（接口删除成功后立即同步本地，避免依赖整体重拉造成闪烁）。
 * @param sessionId - 会话 ID
 */
export async function deleteCachedSession(sessionId: number): Promise<void> {
  try {
    await deleteByKey('sessions', sessionId);
  } catch (error) {
    console.warn('删除本地会话缓存失败', error);
  }
}

/**
 * 删除某会话在本地缓存的全部消息（删除会话时一并清理孤儿记录，避免按会话查询时残留）。
 * @param sessionId - 会话 ID
 */
export async function deleteCachedMessagesBySession(sessionId: number): Promise<void> {
  try {
    await deleteByIndex('messages', 'by_session', sessionId);
  } catch (error) {
    console.warn('删除本地会话消息缓存失败', error);
  }
}

/**
 * 更新本地缓存中会话的最后活跃时间，使侧边栏顺序即时反映最近活跃。
 * @param sessionId - 会话 ID
 * @param updateTime - 更新时间（ISO 字符串），默认当前时间
 */
export async function touchCachedSession(
  sessionId: number,
  updateTime: string = new Date().toISOString(),
): Promise<void> {
  try {
    const existing = await getByKey<CachedSession>('sessions', sessionId);
    if (existing) {
      await putRecord<CachedSession>('sessions', { ...existing, update_time: updateTime });
    }
  } catch (error) {
    console.warn('更新本地会话缓存时间失败', error);
  }
}

/**
 * 写入草稿（防抖调用；空内容表示清除）。
 * @param userId - 当前用户 ID
 * @param sessionKey - 会话标识（已有会话为数字 ID，新会话为 'new'）
 * @param content - 草稿文本
 */
export async function saveDraft(
  userId: number,
  sessionKey: string,
  content: string,
): Promise<void> {
  try {
    if (!content) {
      await clearDraft(userId, sessionKey);
      return;
    }
    await putRecord<CachedDraft>('drafts', {
      key: draftKey(userId, sessionKey),
      user_id: userId,
      session_key: sessionKey,
      content,
      updated_at: Date.now(),
    });
  } catch (error) {
    console.warn('写入本地草稿失败', error);
  }
}

/**
 * 读取草稿（恢复未发送输入）。
 * @param userId - 当前用户 ID
 * @param sessionKey - 会话标识
 * @returns 草稿文本，无则空串
 */
export async function loadDraft(userId: number, sessionKey: string): Promise<string> {
  try {
    const draft = await getByKey<CachedDraft>('drafts', draftKey(userId, sessionKey));
    return draft?.content ?? '';
  } catch (error) {
    console.warn('读取本地草稿失败', error);
    return '';
  }
}

/**
 * 清除草稿（发送成功后调用）。
 * @param userId - 当前用户 ID
 * @param sessionKey - 会话标识
 */
export async function clearDraft(userId: number, sessionKey: string): Promise<void> {
  try {
    await deleteByKey('drafts', draftKey(userId, sessionKey));
  } catch (error) {
    console.warn('清除本地草稿失败', error);
  }
}
