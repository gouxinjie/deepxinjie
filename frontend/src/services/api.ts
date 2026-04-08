import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios';

import type {
  ApiResponse,
  AuthUser,
  ChatStreamChunk,
  CreateSessionData,
  DeleteMessagesData,
  LoginData,
  LoginPayload,
  MessageListData,
  QrCodeData,
  QrCodeStatusData,
  SendMessagePayload,
  SessionListData,
} from '../types/api';

const api = axios.create({
  baseURL: '/api',
});

/**
 * 读取当前登录 Token。
 */
export const getAuthToken = (): string | null => localStorage.getItem('token');

/**
 * 持久化登录态。
 * @param token - 登录令牌
 * @param user - 登录用户信息
 */
export const persistAuthSession = (token: string, user: AuthUser): void => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

/**
 * 清理本地登录态。
 */
export const clearAuthSession = (): void => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

/**
 * 获取本地缓存的用户信息。
 */
export const getStoredUser = (): AuthUser | null => {
  const rawUser = localStorage.getItem('user');
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
};

/**
 * 从 axios / fetch 异常中提取中文错误信息。
 * @param error - 任意异常对象
 * @returns 可直接展示给用户的中文消息
 */
export const extractApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
    return error.response?.data?.message || error.message || '请求失败，请稍后重试';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败，请稍后重试';
};

/**
 * 给所有 axios 请求自动附加 Bearer Token。
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAuthToken();
  const headers = AxiosHeaders.from(config.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  config.headers = headers;
  return config;
});

export const authApi = {
  /**
   * 手机号密码登录。
   * @param data - 登录参数
   */
  login: (data: LoginPayload) => api.post<ApiResponse<LoginData>>('/auth/login', data),

  /**
   * 获取微信登录二维码。
   */
  getQrCode: () => api.get<ApiResponse<QrCodeData>>('/auth/qrcode'),

  /**
   * 轮询二维码登录状态。
   * @param sceneStr - 二维码场景值
   */
  checkStatus: (sceneStr: string) =>
    api.get<ApiResponse<QrCodeStatusData>>(`/auth/qrcode/status?scene_str=${encodeURIComponent(sceneStr)}`),

  /**
   * 退出登录。
   */
  logout: () => api.post<ApiResponse<null>>('/auth/logout'),
};

export const sessionApi = {
  /**
   * 获取会话列表。
   */
  list: () => api.get<ApiResponse<SessionListData>>('/chat/sessions'),

  /**
   * 创建会话。
   * @param title - 会话标题
   */
  create: (title: string) =>
    api.post<ApiResponse<CreateSessionData>>(`/chat/sessions?title=${encodeURIComponent(title)}`),

  /**
   * 重命名会话。
   * @param sessionId - 会话 ID
   * @param title - 新标题
   */
  rename: (sessionId: number, title: string) =>
    api.put<ApiResponse<null>>(`/chat/sessions/${sessionId}`, { title }),

  /**
   * 切换会话置顶状态。
   * @param sessionId - 会话 ID
   */
  pin: (sessionId: number) => api.put<ApiResponse<{ is_pinned: number }>>(`/chat/sessions/${sessionId}/pin`),

  /**
   * 删除会话。
   * @param sessionId - 会话 ID
   */
  delete: (sessionId: number) => api.delete<ApiResponse<null>>(`/chat/sessions/${sessionId}`),

  /**
   * 获取会话消息列表。
   * @param sessionId - 会话 ID
   */
  getMessages: (sessionId: number) =>
    api.get<ApiResponse<MessageListData>>(`/chat/sessions/${sessionId}/messages`),

  /**
   * 删除指定消息之后的记录。
   * @param sessionId - 会话 ID
   * @param afterId - 起始消息 ID
   */
  deleteMessagesAfter: (sessionId: number, afterId: number) =>
    api.delete<ApiResponse<DeleteMessagesData>>(
      `/chat/sessions/${sessionId}/messages?after_id=${afterId}`,
    ),
};

export const messageApi = {
  /**
   * 更新消息内容。
   * @param messageId - 消息 ID
   * @param content - 新内容
   */
  update: (messageId: number, content: string) =>
    api.put<ApiResponse<null>>(`/chat/messages/${messageId}`, { content }),
};

interface SendChatStreamOptions {
  /** 发送请求体 */
  payload: SendMessagePayload;
  /** 分片回调 */
  onChunk: (chunk: ChatStreamChunk) => void;
  /** 连接建立回调 */
  onOpen?: () => void;
  /** 中断控制器信号 */
  signal?: AbortSignal;
}

/**
 * 通过 fetch + POST 接入受鉴权保护的流式聊天接口。
 *
 * 说明：
 * - EventSource 不支持 POST 和自定义 Authorization 头。
 * - 因此这里改为 fetch 读取 SSE 文本流，并手动解析 `data:` 分片。
 */
export const sendChatStream = async ({
  payload,
  onChunk,
  onOpen,
  signal,
}: SendChatStreamOptions): Promise<void> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('未登录或登录已过期');
  }

  const response = await fetch('/api/chat/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    try {
      const errorData = (await response.json()) as ApiResponse<unknown>;
      throw new Error(errorData.message || '发送消息失败');
    } catch (error) {
      if (error instanceof Error && error.message !== 'Unexpected end of JSON input') {
        throw error;
      }
      throw new Error(`发送消息失败（HTTP ${response.status}）`);
    }
  }

  if (!response.body) {
    throw new Error('流式响应不可用');
  }

  onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  /**
   * 解析一个完整的 SSE 块。
   * @param block - 单个 SSE 事件文本
   * @returns 是否收到结束标记
   */
  const handleBlock = (block: string): boolean => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'));

    for (const line of lines) {
      const payloadText = line.slice(5).trim();
      if (!payloadText) {
        continue;
      }

      if (payloadText === '[DONE]') {
        return true;
      }

      onChunk(JSON.parse(payloadText) as ChatStreamChunk);
    }

    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex !== -1) {
      const block = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);

      if (block && handleBlock(block)) {
        return;
      }

      boundaryIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      break;
    }
  }

  const lastBlock = buffer.trim();
  if (lastBlock) {
    handleBlock(lastBlock);
  }
};

export default api;
export type { AxiosError };
