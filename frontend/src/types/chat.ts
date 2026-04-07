/**
 * @description 聊天界面使用的前端消息模型
 * @author
 * @created 2026-04-07
 * @updated 2026-04-07
 */

import type { MessageRole, SearchCitation } from './api';

/**
 * 聊天消息展示模型。
 */
export interface Message {
  /** 前端消息唯一标识 */
  id: string;
  /** 消息角色 */
  role: MessageRole;
  /** 最终展示内容 */
  content: string;
  /** 深度思考推理过程 */
  reasoning?: string;
  /** 联网搜索引用 */
  citations?: SearchCitation[];
  /** 联网搜索状态 */
  searchStatus?: string;
  /** 是否处于思考中 */
  isThinking?: boolean;
  /** 思考耗时，单位秒 */
  thinkingTime?: number;
  /** 是否处于加载中 */
  isLoading?: boolean;
}
