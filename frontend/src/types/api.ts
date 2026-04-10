/**
 * @description 前后端接口通用类型定义
 * @author
 * @created 2026-04-07
 * @updated 2026-04-10
 */

/**
 * 接口成功响应结构。
 * @template T - data 字段的具体类型
 */
export interface ApiSuccessResponse<T> {
  /** 请求是否成功 */
  success: true;
  /** 业务状态码 */
  code: number;
  /** 中文提示信息 */
  message: string;
  /** 业务数据 */
  data: T;
}

/**
 * 接口失败响应结构。
 */
export interface ApiErrorResponse {
  /** 请求是否成功 */
  success: false;
  /** 业务状态码 */
  code: number | string;
  /** 中文错误信息 */
  message: string;
  /** 错误明细 */
  data: unknown;
}

/**
 * 通用接口响应类型。
 * @template T - 成功时 data 字段类型
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * 消息角色类型。
 */
export type MessageRole = 'user' | 'assistant';

/**
 * 联网搜索引用信息。
 */
export interface SearchCitation {
  /** 引用编号 */
  id: number;
  /** 网页标题 */
  title: string;
  /** 网页链接 */
  url: string;
  /** 来源域名 */
  domain: string;
  /** 摘要内容 */
  snippet: string;
}

/**
 * 登录用户信息。
 */
export interface AuthUser {
  /** 用户 ID */
  id: number;
  /** 用户昵称 */
  nickname: string;
  /** 手机号 */
  phone?: string;
  /** 用户头像 */
  avatar?: string;
}

/**
 * 手机号登录请求参数。
 */
export interface LoginPayload {
  /** 手机号 */
  phone: string;
  /** 登录密码 */
  password: string;
}

/**
 * 认证成功后的会话数据。
 */
export interface AuthSessionData {
  /** 短效 Access Token */
  accessToken: string;
  /** Access Token 剩余有效秒数 */
  expiresIn: number;
  /** 当前登录用户 */
  user: AuthUser;
}

/**
 * 当前登录用户信息数据。
 */
export interface CurrentUserData {
  /** 当前登录用户 */
  user: AuthUser;
}

/**
 * 二维码登录数据。
 */
export interface QrCodeData {
  /** 二维码图片地址 */
  qr_url: string;
  /** 二维码轮询场景值 */
  scene_str: string;
}

/**
 * 二维码轮询状态数据。
 */
export interface QrCodeStatusData {
  /** 轮询状态 */
  status?: number;
  /** 短效 Access Token */
  accessToken?: string;
  /** Access Token 剩余有效秒数 */
  expiresIn?: number;
  /** 当前登录用户 */
  user?: AuthUser;
}

/**
 * 会话列表项。
 */
export interface SessionItem {
  /** 会话 ID */
  id: number;
  /** 会话标题 */
  title: string;
  /** 更新时间 */
  update_time: string;
  /** 是否置顶 */
  is_pinned?: number;
}

/**
 * 会话列表响应数据。
 */
export interface SessionListData {
  /** 会话列表 */
  sessions: SessionItem[];
}

/**
 * 创建会话响应数据。
 */
export interface CreateSessionData {
  /** 新建会话 ID */
  session_id: number;
}

/**
 * 消息记录。
 */
export interface MessageRecord {
  /** 消息 ID */
  id: number;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 推理内容 */
  reasoning?: string;
  /** 联网搜索引用 */
  citations?: SearchCitation[];
  /** 联网搜索状态 */
  search_status?: string;
  /** 思考耗时 */
  thinking_time?: number;
}

/**
 * 消息列表响应数据。
 */
export interface MessageListData {
  /** 消息数组 */
  messages: MessageRecord[];
}

/**
 * 删除消息响应数据。
 */
export interface DeleteMessagesData {
  /** 删除条数 */
  deleted_count: number;
}

/**
 * 聊天流式发送请求体。
 */
export interface SendMessagePayload {
  /** 用户消息内容 */
  content: string;
  /** 是否开启深度思考 */
  is_deepthink: boolean;
  /** 是否开启联网搜索 */
  is_search: boolean;
  /** 会话 ID */
  session_id: number;
}

/**
 * 流式响应分片。
 */
export interface ChatStreamChunk {
  /** 回复正文分片 */
  content?: string;
  /** 推理分片 */
  reasoning?: string;
  /** 联网搜索引用 */
  citations?: SearchCitation[];
  /** 联网搜索状态 */
  search_status?: string;
  /** 思考耗时 */
  thinking_time?: number;
}
