import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios';

import { useAuthStore } from '../store/authStore';
import type {
  ApiResponse,
  AuthSessionData,
  ChatStreamChunk,
  CreateSessionData,
  CurrentUserData,
  DeleteMessagesData,
  LoginPayload,
  MessageListData,
  RegisterPayload,
  SendMessagePayload,
  SessionListData,
} from '../types/api';

interface ApiDetailResponse {
  /** FastAPI 默认错误详情 */
  detail?: string;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  /** 是否已经执行过一次刷新重试 */
  _retry?: boolean;
}

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

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

const authClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

const AUTH_RETRY_EXCLUDED_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'] as const;
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

let refreshPromise: Promise<string | null> | null = null;

/**
 * 判断当前请求是否不应触发自动刷新。
 * @param url - 请求地址
 * @returns 是否跳过自动刷新
 */
const shouldSkipAuthRetry = (url?: string): boolean => {
  if (!url) {
    return false;
  }

  return AUTH_RETRY_EXCLUDED_URLS.some((path) => url.includes(path));
};

/**
 * 从浏览器 Cookie 中读取指定值。
 * @param name - Cookie 名称
 * @returns Cookie 值，不存在时返回 null
 */
const getCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const prefix = `${name}=`;
  const cookieItem = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  if (!cookieItem) {
    return null;
  }

  return decodeURIComponent(cookieItem.slice(prefix.length));
};

/**
 * 读取当前 CSRF Token。
 * @returns CSRF Token，不存在时返回 null
 */
const getCsrfToken = (): string | null => getCookieValue(CSRF_COOKIE_NAME);

/**
 * 给请求头附加 Bearer Token 和 CSRF Token。
 * @param config - axios 请求配置
 * @param attachBearer - 是否附加 Bearer Token
 * @returns 处理后的请求配置
 */
const attachRequestHeaders = (
  config: InternalAxiosRequestConfig,
  attachBearer: boolean,
): InternalAxiosRequestConfig => {
  const headers = AxiosHeaders.from(config.headers);
  const csrfToken = getCsrfToken();

  if (attachBearer) {
    const token = getAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  if (csrfToken) {
    headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  config.headers = headers;
  config.withCredentials = true;
  return config;
};

/**
 * 读取当前登录 Token。
 * @returns Access Token 或 null
 */
export const getAuthToken = (): string | null => useAuthStore.getState().accessToken;

/**
 * 应用新的登录会话。
 * @param session - 登录会话数据
 */
export const persistAuthSession = (session: AuthSessionData): void => {
  useAuthStore.getState().setSession(session.accessToken, session.user);
};

/**
 * 清理当前登录会话。
 */
export const clearAuthSession = (): void => {
  useAuthStore.getState().clearSession();
};

/**
 * 跳转到登录页。
 */
const redirectToLogin = (): void => {
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
};

/**
 * 统一处理登录凭证失效。
 * @param shouldRedirect - 是否立刻跳转登录页
 */
const handleUnauthorized = (shouldRedirect: boolean): void => {
  clearAuthSession();
  useAuthStore.getState().setInitialized(true);

  if (shouldRedirect) {
    redirectToLogin();
  }
};

/**
 * 从 axios 或 fetch 异常中提取中文错误信息。
 * @param error - 任意异常对象
 * @returns 可直接展示给用户的错误消息
 */
export const extractApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<ApiResponse<unknown> | ApiDetailResponse>(error)) {
    const responseData = error.response?.data;

    if (responseData && 'message' in responseData && typeof responseData.message === 'string') {
      return responseData.message;
    }

    if (responseData && 'detail' in responseData && typeof responseData.detail === 'string') {
      return responseData.detail;
    }

    return error.message || '请求失败，请稍后重试';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败，请稍后重试';
};

/**
 * 自动刷新 Access Token。
 * @returns 刷新后的 Access Token，失败时返回 null
 */
export const refreshAuthSession = async (): Promise<string | null> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await authClient.post<ApiResponse<AuthSessionData>>('/auth/refresh');
      if (!response.data.success) {
        handleUnauthorized(false);
        return null;
      }

      persistAuthSession(response.data.data);
      return response.data.data.accessToken;
    } catch {
      handleUnauthorized(false);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

/**
 * 应用启动时恢复登录态。
 */
export const initializeAuthSession = async (): Promise<void> => {
  const authState = useAuthStore.getState();
  if (authState.initialized || authState.bootstrapping) {
    return;
  }

  authState.setBootstrapping(true);
  try {
    await refreshAuthSession();
  } finally {
    const latestState = useAuthStore.getState();
    latestState.setBootstrapping(false);
    latestState.setInitialized(true);
  }
};

/**
 * 退出当前登录会话。
 */
export const logoutAuthSession = async (): Promise<void> => {
  try {
    await authApi.logout();
  } catch {
    // 退出登录以本地清理为兜底，接口失败不阻塞前端状态回收。
  }

  handleUnauthorized(false);
};

/**
 * 给业务请求附加 Bearer Token 和 CSRF Token。
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) =>
  attachRequestHeaders(config, true),
);

/**
 * 给认证请求附加 CSRF Token。
 */
authClient.interceptors.request.use((config: InternalAxiosRequestConfig) =>
  attachRequestHeaders(config, false),
);

/**
 * 统一处理 401，优先刷新，再决定是否跳回登录页。
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<unknown> | ApiDetailResponse>) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const statusCode = error.response?.status;

    if (statusCode !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    if (originalRequest._retry || shouldSkipAuthRetry(originalRequest.url)) {
      handleUnauthorized(true);
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    const nextToken = await refreshAuthSession();
    if (!nextToken) {
      handleUnauthorized(true);
      return Promise.reject(error);
    }

    const headers = AxiosHeaders.from(originalRequest.headers);
    headers.set('Authorization', `Bearer ${nextToken}`);

    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set(CSRF_HEADER_NAME, csrfToken);
    }

    originalRequest.headers = headers;
    originalRequest.withCredentials = true;

    return api(originalRequest);
  },
);

export const authApi = {
  /**
   * 账号密码登录。
   * @param data - 登录参数
   */
  login: (data: LoginPayload) => api.post<ApiResponse<AuthSessionData>>('/auth/login', data),

  /**
   * 注册账号。
   * @param data - 注册参数
   */
  register: (data: RegisterPayload) =>
    api.post<ApiResponse<AuthSessionData>>('/auth/register', data),

  /**
   * 获取当前登录用户信息。
   */
  me: () => api.get<ApiResponse<CurrentUserData>>('/auth/me'),

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
  pin: (sessionId: number) =>
    api.put<ApiResponse<{ is_pinned: number }>>(`/chat/sessions/${sessionId}/pin`),

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

  /**
   * 停止指定助手消息生成。
   * @param messageId - 消息 ID
   */
  stop: (messageId: number) => api.post<ApiResponse<null>>(`/chat/messages/${messageId}/stop`),
};

/**
 * 构造聊天流请求。
 * @param accessToken - 当前 Access Token
 * @param payload - 请求体
 * @param signal - 中断信号
 * @returns 原始 fetch 响应
 */
const requestChatStream = async (
  accessToken: string,
  payload: SendMessagePayload,
  signal?: AbortSignal,
): Promise<Response> => {
  return fetch('/api/chat/send', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
};

/**
 * 通过 fetch + POST 接入受鉴权保护的流式聊天接口。
 * 说明：
 * - EventSource 不支持 POST 和自定义 Authorization 头
 * - 这里改为 fetch 读取 SSE 文本流，并手动解析 data 分片
 */
export const sendChatStream = async ({
  payload,
  onChunk,
  onOpen,
  signal,
}: SendChatStreamOptions): Promise<void> => {
  let token = getAuthToken();
  if (!token) {
    token = await refreshAuthSession();
  }

  if (!token) {
    handleUnauthorized(true);
    throw new Error('未登录或登录已过期');
  }

  let response = await requestChatStream(token, payload, signal);
  if (response.status === 401) {
    const refreshedToken = await refreshAuthSession();
    if (!refreshedToken) {
      handleUnauthorized(true);
      throw new Error('未登录或登录已过期');
    }

    response = await requestChatStream(refreshedToken, payload, signal);
  }

  if (!response.ok) {
    try {
      const errorData = (await response.json()) as ApiResponse<unknown> | ApiDetailResponse;

      if ('message' in errorData && typeof errorData.message === 'string') {
        throw new Error(errorData.message);
      }

      if ('detail' in errorData && typeof errorData.detail === 'string') {
        throw new Error(errorData.detail);
      }

      throw new Error('发送消息失败');
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
