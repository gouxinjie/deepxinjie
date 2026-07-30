/**
 * @component ChatMain
 * @description 主聊天区域组件，负责会话消息渲染、流式对话、引用来源面板与滚动定位等核心交互。
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-08
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Share2, Zap } from 'lucide-react';
import classNames from 'classnames';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

import styles from './ChatMain.module.scss';
import ChatAnchor from './ChatAnchor';
import ChatCitationPanel from './ChatCitationPanel';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import ChatWelcome from './ChatWelcome';
import Toast from '../../components/commons/Toast';
import { extractApiErrorMessage, messageApi, sendChatStream, sessionApi } from '../../services/api';
import { cacheMessages, getCachedMessages, upsertMessage, deleteCachedMessage } from '../../services/localCache';

/** 流式消息落盘节流间隔（毫秒），避免每个 chunk 都写 IndexedDB 造成主线程抖动 */
const CACHE_PERSIST_INTERVAL = 200;
import { useSessionStore } from '../../store/sessionStore';
import type { Message } from '../../types/chat';
import type { ChatStreamChunk, MessageRecord, MessageStatus } from '../../types/api';

interface ChatMainProps {
  /** 是否开启深度思考模式。 */
  isDeepThink: boolean;
  /** 切换深度思考模式的回调。 */
  setIsDeepThink: (val: boolean) => void;
  /** 是否开启联网搜索模式。 */
  isSearch: boolean;
  /** 切换联网搜索模式的回调。 */
  setIsSearch: (val: boolean) => void;
  /** 桌面端侧边栏是否收起；收起时浮动头部(floatingHeader)固定在左上角，标题栏需左移让位避免被遮挡。 */
  isCollapsed?: boolean;
}

interface CitationPanelState {
  /** 引用来源列表：当前消息联网搜索返回的引用条目。 */
  /** 为空数组表示无引用来源。 */
  citations: Message['citations'];
  /** 联网搜索请求状态（如 loading / done / error）。 */
  searchStatus?: string;
  /** 当前高亮的引用条目 ID，null 表示无高亮。 */
  activeCitationId?: number | null;
}

const ChatMain: React.FC<ChatMainProps> = ({
  isDeepThink,
  setIsDeepThink,
  isSearch,
  setIsSearch,
  isCollapsed = false,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [shouldFocus, setShouldFocus] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [activeAnchorId, setActiveAnchorId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [citationPanelState, setCitationPanelState] = useState<CitationPanelState | null>(null);
  const [isCitationPanelVisible, setIsCitationPanelVisible] = useState(false);

  const { sessionId } = useParams<{ sessionId: string }>();

  // 当前会话标题：根据 URL 中的 sessionId 从会话列表匹配，用于顶部标题栏展示
  const currentSessionTitle = useSessionStore((state) =>
    state.sessions.find((item) => item.id === Number.parseInt(sessionId ?? '', 10))?.title ?? '',
  );

  // 顶部提示状态：分享功能开发中，点击分享按钮时弹出，由共享 Toast 组件自动消失
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  // 当前登录用户 ID，用于本地缓存命名空间隔离（未登录时为 0，跳过缓存）
  const userId = useAuthStore((state) => state.user?.id) ?? 0;
  // 流式会话上下文，供增量落盘时定位会话与用户
  const cacheContextRef = useRef<{ userId: number; sessionId: number } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const highlightMessageId = (location.state as { highlightMessageId?: number | string } | null)?.highlightMessageId;
  const updateSessionTitle = useSessionStore((state) => state.updateSessionTitle);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // 滚动事件 rAF 节流标记：避免高频 scroll 事件同步执行昂贵计算
  const scrollRafRef = useRef<number | null>(null);
  // 缓存每个消息 id 的 ref 回调，避免每次渲染都重建内联回调导致的重复赋值
  const messageRefCallbacks = useRef<Map<string, (element: HTMLDivElement | null) => void>>(new Map());

  // 为每个消息 id 返回稳定（缓存）的 ref 回调，避免每次渲染重建内联回调
  const getMessageRefCallback = useCallback((id: string) => {
    const callbacks = messageRefCallbacks.current;
    let callback = callbacks.get(id);
    if (!callback) {
      callback = (element: HTMLDivElement | null) => {
        messageRefs.current[id] = element;
      };
      callbacks.set(id, callback);
    }
    return callback;
  }, []);
  const isStartingNewChat = useRef(false);
  const streamControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const lastCachePersistRef = useRef(0);
  const autoScrollEnabledRef = useRef(true);
  const isStreamingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  /**
   * 计算用户消息锚点列表，用于在会话内快速定位与跳转至指定用户消息。
   */
  const anchorItems = useMemo(() => {
    return messages
      .filter((message) => message.role === 'user')
      .map((message, index) => {
        const normalized = message.content.replace(/\s+/g, ' ').trim();
        const title = normalized.length > 30 ? `${normalized.slice(0, 30)}...` : normalized;

        return {
          id: message.id,
          title: title || `对话 ${index + 1}`,
        };
      });
  }, [messages]);

  /**
   * 判断指定滚动容器当前是否接近底部，作为自动滚动决策的辅助函数。
   * @param threshold - 判定为“接近底部”的阈值（像素），默认 24。
   */
  const isNearBottom = (element: HTMLDivElement, threshold = 24): boolean => {
    return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
  };

  const cancelScheduledScroll = () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  };

  const scheduleScrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const element = chatAreaRef.current;
    if (!element) {
      return;
    }

    cancelScheduledScroll();

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      isProgrammaticScrollRef.current = true;
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });

      window.requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    });
  };

  /**
   * 聊天区域滚动事件处理：根据是否接近底部更新“自动滚动到底部”状态，并控制滚动指示器显隐。
   */
  // 滚动处理使用 rAF 节流：高频 scroll 事件合并到下一帧执行，避免主线程抖动
  const handleScroll = () => {
    if (scrollRafRef.current !== null) {
      return;
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const chatElement = chatAreaRef.current;
      if (!chatElement) {
        return;
      }

      const nearBottom = isNearBottom(chatElement, 40);
      // 仅当值真正变化时才触发 setState，避免无差别重渲染
      setShowScrollButton((prev) => (prev === !nearBottom ? prev : !nearBottom));

      if (!isProgrammaticScrollRef.current) {
        if (nearBottom) {
          if (isStreamingRef.current) {
            autoScrollEnabledRef.current = true;
          }
        } else {
          autoScrollEnabledRef.current = false;
          cancelScheduledScroll();
        }
      }

      if (anchorItems.length === 0) {
        return;
      }

      const containerTop = chatElement.getBoundingClientRect().top;
      let currentAnchor = anchorItems[0].id;

      for (const anchor of anchorItems) {
        const target = messageRefs.current[anchor.id];
        if (!target) {
          continue;
        }

        const targetTop = target.getBoundingClientRect().top - containerTop;
        if (targetTop <= 120) {
          currentAnchor = anchor.id;
        } else {
          break;
        }
      }

      // 仅当当前激活锚点变化时才更新状态
      setActiveAnchorId((prev) => (prev === currentAnchor ? prev : currentAnchor));
    });
  };

  /**
   * 点击消息锚点时的处理：将目标用户消息滚动至视图顶部，实现会话内快速跳转。
   * @param messageId - 目标消息的唯一标识。
   */
  const handleAnchorClick = (messageId: string) => {
    const target = messageRefs.current[messageId];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'auto', block: 'start' });
    setActiveAnchorId(messageId);
  };

  /**
   * 打开引用来源面板：根据消息携带的引用条目与搜索状态初始化面板数据。
   * @param payload - 包含目标消息对象与可选高亮引用 ID 的载荷。
   */
  const handleOpenCitations = (payload: { message: Message; activeCitationId?: number }) => {
    setCitationPanelState({
      citations: payload.message.citations,
      searchStatus: payload.message.searchStatus,
      activeCitationId: payload.activeCitationId ?? null,
    });
  };

  /**
   * 关闭引用来源面板。
   */
  const handleCloseCitations = () => {
    setIsCitationPanelVisible(false);
  };

  /**
   * 当引用面板不可见且仍存在面板数据超过延时后，自动清空面板状态以释放资源。
   */
  useEffect(() => {
    if (isCitationPanelVisible || !citationPanelState) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setCitationPanelState(null);
    }, 320);

    return () => window.clearTimeout(timer);
  }, [citationPanelState, isCitationPanelVisible]);

  /**
   * 当存在引用面板数据后，在下一帧将面板标记为可见，触发展开动画。
   */
  useEffect(() => {
    if (!citationPanelState) {
      return undefined;
    }

    const rafId = window.requestAnimationFrame(() => {
      setIsCitationPanelVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [citationPanelState]);

  /**
   * 引用面板可见时，监听 Escape 键用于关闭面板。
   */
  useEffect(() => {
    if (!isCitationPanelVisible) {
      return undefined;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCitationPanelVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeydown);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [isCitationPanelVisible]);

  /**
   * 将服务端或本地缓存的消息记录数组转换为前端渲染所需的 Message 结构。
   * @param records - 待转换的原始消息记录数组。
   */
  const formatMessages = (records: MessageRecord[]): Message[] => {
    return records.map((record) => ({
      id: record.id.toString(),
      role: record.role,
      content: record.content,
      reasoning: record.reasoning,
      citations: record.citations,
      searchStatus: record.search_status,
      thinkingTime: record.thinking_time,
      status: record.status ?? 'completed',
    }));
  };

  /**
   * 加载指定会话的消息列表：优先使用本地缓存秒级渲染，随后静默同步服务端数据。
   * @param id - 目标会话 ID。
   */
  const loadMessages = async (id: number) => {
    setIsLoading(true);
    setRequestError('');

    // 优先从本地缓存秒级渲染，随后静默同步服务端
    let loadedFromCache = false;
    if (userId > 0) {
      try {
        const cached = await getCachedMessages(userId, id);
        if (cached.length > 0) {
          loadedFromCache = true;
          shouldScrollToBottomRef.current = true;
          autoScrollEnabledRef.current = true;
          setMessages(cached);
          setCitationPanelState(null);
          setIsCitationPanelVisible(false);
        }
      } catch (cacheError) {
        console.warn('读取本地消息缓存失败', cacheError);
      }
    }

    try {
      const response = await sessionApi.getMessages(id);
      if (response.data.success) {
        const messages = formatMessages(response.data.data.messages);
        shouldScrollToBottomRef.current = true;
        autoScrollEnabledRef.current = true;
        setMessages(messages);
        setCitationPanelState(null);
        setIsCitationPanelVisible(false);
        if (userId > 0) {
          void cacheMessages(userId, id, messages);
        }
        return;
      }

      if (!loadedFromCache) {
        setMessages([]);
      }
      setRequestError(response.data.message);
    } catch (error) {
      if (!loadedFromCache) {
        setMessages([]);
      }
      setRequestError(extractApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 将流式分片应用到对应 AI 消息：累积内容与推理过程，并在首个分片时建立消息映射。
   * @param aiMessageId - 当前 AI 消息的唯一标识（字符串）。
   * @param chunk - 服务端推送的单个流式分片数据。
   */
  const applyStreamChunk = (aiMessageId: string, chunk: ChatStreamChunk) => {
    setMessages((prev) => {
      const nextMessages = [...prev];
      const prevStreamId = streamingMessageIdRef.current;
      const nextMessageId =
        typeof chunk.message_id === 'number'
          ? chunk.message_id.toString()
          : (streamingMessageIdRef.current ?? aiMessageId);
      const targetIndex = nextMessages.findIndex(
        (item) => item.id === aiMessageId || item.id === nextMessageId,
      );

      if (targetIndex === -1) {
        return prev;
      }

      const nextMessage = { ...nextMessages[targetIndex] };

      if (typeof chunk.message_id === 'number') {
        nextMessage.id = chunk.message_id.toString();
        streamingMessageIdRef.current = nextMessage.id;
      }

      if (chunk.message_status) {
        nextMessage.status = chunk.message_status;
        nextMessage.isLoading = chunk.message_status === 'streaming' && !nextMessage.content;
        nextMessage.isThinking =
          chunk.message_status === 'streaming' && Boolean(nextMessage.reasoning) && !nextMessage.content;
      }

      if (chunk.reasoning) {
        nextMessage.reasoning = `${nextMessage.reasoning || ''}${chunk.reasoning}`;
        nextMessage.isThinking = true;
        nextMessage.isLoading = false;
        nextMessage.status = 'streaming';
      }

      if (chunk.citations) {
        nextMessage.citations = chunk.citations;
      }

      if (chunk.search_status) {
        nextMessage.searchStatus = chunk.search_status;
      }

      if (typeof chunk.thinking_time === 'number') {
        nextMessage.thinkingTime = chunk.thinking_time;
      }

      if (chunk.content) {
        nextMessage.content = `${nextMessage.content}${chunk.content}`;
        nextMessage.isThinking = false;
        nextMessage.isLoading = false;
        nextMessage.status = 'streaming';
      }

      nextMessages[targetIndex] = nextMessage;

      // 增量持久化到本地，断网或刷新后可恢复。
      // 仅当消息已获得真实 id（非本地临时 UUID）才落盘，避免临时 id 残留导致重复显示；
      // 高频 chunk 做节流（≥CACHE_PERSIST_INTERVAL）以降低主线程占用，最终内容由 finishStreamingMessage 兜底落盘。
      const ctx = cacheContextRef.current;
      if (ctx && nextMessage.id !== aiMessageId) {
        if (prevStreamId && prevStreamId !== nextMessage.id) {
          void deleteCachedMessage(prevStreamId);
        }
        const now = Date.now();
        if (now - lastCachePersistRef.current >= CACHE_PERSIST_INTERVAL) {
          lastCachePersistRef.current = now;
          void upsertMessage(ctx.userId, ctx.sessionId, nextMessage);
        }
      }

      return nextMessages;
    });
  };

  /**
   * 结束指定 AI 消息的流式状态：写入最终内容与状态，并将消息标记为已完成。
   * @param aiMessageId - 需要结束的 AI 消息唯一标识。
   * @param fallbackContent - 兜底内容；statusOrFallback 用于指定消息的最终状态（正常结束/中断）。
   */
  const finishStreamingMessage = (
    aiMessageId: string,
    statusOrFallback?: MessageStatus | string,
    fallbackContent?: string,
  ) => {
    setMessages((prev) => {
      const nextMessages = [...prev];
      const targetIndex = nextMessages.findIndex(
        (item) => item.id === aiMessageId || item.id === streamingMessageIdRef.current,
      );

      if (targetIndex === -1) {
        return prev;
      }

      const nextMessage = { ...nextMessages[targetIndex] };
      nextMessage.isLoading = false;
      nextMessage.isThinking = false;
      const normalizedStatus: MessageStatus =
        statusOrFallback === 'streaming' ||
        statusOrFallback === 'stopped' ||
        statusOrFallback === 'completed' ||
        statusOrFallback === 'failed'
          ? statusOrFallback
          : 'completed';
      const nextFallbackContent =
        normalizedStatus === 'completed' && typeof statusOrFallback === 'string'
          ? statusOrFallback
          : fallbackContent;
      nextMessage.status = normalizedStatus;

      if (nextFallbackContent && !nextMessage.content) {
        nextMessage.content = nextFallbackContent;
      }

      nextMessages[targetIndex] = nextMessage;

      // 完成态消息落盘，确保最终内容持久化；
      // 仅当消息已获得真实（数字）ID 才写入，避免把临时 UUID 消息残留为孤儿记录
      // （例如流式在收到首个分片前就被中断/报错时，nextMessage.id 仍是客户端临时串）。
      const ctx = cacheContextRef.current;
      if (ctx && /^\d+$/.test(nextMessage.id)) {
        void upsertMessage(ctx.userId, ctx.sessionId, nextMessage);
      }

      return nextMessages;
    });
  };

  /**
   * 启动一次完整的流式对话：创建用户与 AI 消息、调用后端流式接口并逐分片更新。
   */
  const startStream = async (options: {
    content: string;
    sessionId: number;
    isDeepThinkEnabled: boolean;
    isSearchEnabled: boolean;
    continueFromMessageId?: number;
    buildNextMessages: (prev: Message[], aiMessageId: string) => Message[];
    onOpen?: () => void;
    onRequestError?: () => void;
  }) => {
    const aiMessageId = options.continueFromMessageId?.toString() ?? crypto.randomUUID();
    const controller = new AbortController();
    let hasOpened = false;
    let activeMessageId = aiMessageId;

    streamControllerRef.current?.abort();
    streamControllerRef.current = controller;
    streamingMessageIdRef.current = aiMessageId;
    setRequestError('');
    isStreamingRef.current = true;
    setIsStreaming(true);
    autoScrollEnabledRef.current = true;
    shouldScrollToBottomRef.current = true;

    setMessages((prev) => options.buildNextMessages(prev, aiMessageId));
    // 记录当前流式会话上下文，供增量落盘使用
    cacheContextRef.current = { userId, sessionId: options.sessionId };

    try {
      await sendChatStream({
        payload: {
          content: options.content,
          is_deepthink: options.isDeepThinkEnabled,
          is_search: options.isSearchEnabled,
          session_id: options.sessionId,
          continue_from_message_id: options.continueFromMessageId ?? null,
        },
        onOpen: () => {
          hasOpened = true;
          options.onOpen?.();
        },
        signal: controller.signal,
        onChunk: (chunk) => {
          if (typeof chunk.message_id === 'number') {
            activeMessageId = chunk.message_id.toString();
          }
          if (typeof chunk.title === 'string' && typeof chunk.session_id === 'number') {
            updateSessionTitle(chunk.session_id, chunk.title);
          }
          applyStreamChunk(aiMessageId, chunk);
        },
      });

      finishStreamingMessage(activeMessageId, 'completed');
    } catch (error) {
      if (controller.signal.aborted) {
        finishStreamingMessage(activeMessageId, 'stopped');
        if (!hasOpened) {
          options.onRequestError?.();
        }
        return;
      }

      const errorMessage = extractApiErrorMessage(error);
      setRequestError(errorMessage);
      if (!hasOpened) {
        options.onRequestError?.();
      }
      finishStreamingMessage(activeMessageId, `\u8bf7\u6c42\u5931\u8d25\uff1a${errorMessage}`);
      return;

    } finally {
      if (streamControllerRef.current === controller) {
        isStreamingRef.current = false;
        setIsStreaming(false);
        streamControllerRef.current = null;
        streamingMessageIdRef.current = null;
      }
    }
  };

  /**
   * 中断当前正在进行的流式生成：取消 AbortController 并通知服务端停止推送。
   * @param messageId - 需要停止的消息 ID；缺省时停止当前流式消息。
   * 通过中断底层请求控制器终止接收，并将消息标记为已停止。
   * 同时调用后端 stop 接口以释放服务端生成资源。
   */
  const stopCurrentStream = async (messageId?: string): Promise<void> => {
    const controller = streamControllerRef.current;
    if (!controller) {
      return;
    }

    const targetMessageId = messageId || streamingMessageIdRef.current;
    controller.abort();
    isStreamingRef.current = false;
    setIsStreaming(false);

    if (targetMessageId) {
      finishStreamingMessage(targetMessageId, 'stopped');
      const numericMessageId = Number.parseInt(targetMessageId, 10);
      if (!Number.isNaN(numericMessageId)) {
        try {
          await messageApi.stop(numericMessageId);
        } catch {
          // 停止请求失败时忽略异常，避免中断整体交互流程。
        }
      }
    }
  };
  const handleSend = async (
    content: string,
    isDeepThinkEnabled: boolean,
    isSearchEnabled: boolean,
  ): Promise<boolean> => {
    let currentSessionId = sessionId ? Number.parseInt(sessionId, 10) : undefined;

    if (!currentSessionId) {
      try {
        const title = content.length > 20 ? `${content.slice(0, 20)}...` : content;
        const response = await sessionApi.create(title);

        if (!response.data.success) {
          setRequestError(response.data.message);
          return false;
        }

        currentSessionId = response.data.data.session_id;
        // 新建会话后立即写入全局会话列表，使侧边栏即时展示该会话（无需等待后续刷新）
        useSessionStore.getState().addSession({
          id: currentSessionId,
          title,
          update_time: new Date().toISOString(),
          is_pinned: 0,
        });
        isStartingNewChat.current = true;
        navigate(`/chat/${currentSessionId}`, { replace: true });
      } catch (error) {
        setRequestError(extractApiErrorMessage(error));
        return false;
      }
    }

    if (!currentSessionId) {
      setRequestError('\u521b\u5efa\u4f1a\u8bdd\u5931\u8d25');
      return false;
    }

    shouldScrollToBottomRef.current = true;
    autoScrollEnabledRef.current = true;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    // 用户消息即时落盘，刷新后可恢复
    if (userId > 0) {
      void upsertMessage(userId, currentSessionId, userMessage);
    }

    return new Promise<boolean>((resolve) => {
      let isSettled = false;
      const settle = (result: boolean) => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        resolve(result);
      };

      void startStream({
        content,
        sessionId: currentSessionId,
        isDeepThinkEnabled,
        isSearchEnabled,
        buildNextMessages: (prev, aiMessageId) => [
          ...prev,
          userMessage,
          {
            id: aiMessageId,
            role: 'assistant',
            content: '',
            isThinking: isDeepThinkEnabled,
            isLoading: true,
            status: 'streaming',
          },
        ],
        onOpen: () => {
          settle(true);
        },
        onRequestError: () => {
          settle(false);
        },
      });
    });
  };

  /**
   * 重新生成指定 AI 消息：删除其后所有消息并基于上下文重新发起流式对话。
   * @param messageId - 触发重新生成的源 AI 消息 ID。
   */
  const handleRegenerate = (messageId: string) => {
    if (!sessionId) {
      return;
    }

    const targetIndex = messages.findIndex((item) => item.id === messageId);
    if (targetIndex <= 0) {
      return;
    }

    const userMessage = messages[targetIndex - 1];
    if (!userMessage || userMessage.role !== 'user') {
      return;
    }

    shouldScrollToBottomRef.current = true;
    autoScrollEnabledRef.current = true;
    setMessages((prev) => prev.slice(0, targetIndex));

    void startStream({
      content: userMessage.content,
      sessionId: Number.parseInt(sessionId, 10),
      isDeepThinkEnabled: isDeepThink,
      isSearchEnabled: isSearch,
      buildNextMessages: (prev, aiMessageId) => [
        ...prev,
        {
          id: aiMessageId,
          role: 'assistant',
          content: '',
          isThinking: isDeepThink,
          isLoading: true,
          status: 'streaming',
        },
      ],
    });
  };

  /**
   * 基于指定消息继续生成：以该消息之后的上下文向后端请求续写。
   * @param messageId - 触发“继续生成”的源消息 ID。
   * 续写结果将作为新的 AI 消息追加到当前会话末尾。
   */
  const handleContinueGenerate = (messageId: string) => {
    if (!sessionId) {
      return;
    }

    const numericMessageId = Number.parseInt(messageId, 10);
    if (Number.isNaN(numericMessageId)) {
      return;
    }

    shouldScrollToBottomRef.current = true;
    autoScrollEnabledRef.current = true;

    void startStream({
      content: '',
      sessionId: Number.parseInt(sessionId, 10),
      isDeepThinkEnabled: isDeepThink,
      isSearchEnabled: isSearch,
      continueFromMessageId: numericMessageId,
      buildNextMessages: (prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                isLoading: !message.content,
                isThinking: isDeepThink && !message.content,
                status: 'streaming',
              }
            : message,
        ),
    });
  };

  const handleEditSend = async (newContent: string): Promise<boolean> => {
    const nextContent = newContent.trim();
    if (!nextContent) {
      return false;
    }

    if (isStreamingRef.current) {
      setRequestError('\u5f53\u524d\u56de\u7b54\u751f\u6210\u4e2d\uff0c\u8bf7\u7b49\u5f85\u5b8c\u6210\u540e\u518d\u53d1\u9001\u7f16\u8f91\u540e\u7684\u5185\u5bb9');
      return false;
    }

    return handleSend(nextContent, isDeepThink, isSearch);
  };

  /**
   * 当未选中会话（进入空白态）时，请求下一帧聚焦输入框以引导用户发起对话。
   */
  useEffect(() => {
    if (sessionId) {
      return undefined;
    }

    const rafId = requestAnimationFrame(() => {
      setShouldFocus(true);
      window.setTimeout(() => setShouldFocus(false), 100);
    });

    return () => cancelAnimationFrame(rafId);
  }, [sessionId]);

  /**
   * 会话切换后的延迟处理：区分“新建会话”与“打开已有会话”，重置相关标记与滚动状态。
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (sessionId) {
        if (isStartingNewChat.current) {
          isStartingNewChat.current = false;
          return;
        }

        streamControllerRef.current?.abort();
        void loadMessages(Number.parseInt(sessionId, 10));
        return;
      }

      streamControllerRef.current?.abort();
      setRequestError('');
      setMessages([]);
      setIsLoading(false);
      setCitationPanelState(null);
      setIsCitationPanelVisible(false);
      isStreamingRef.current = false;
      setIsStreaming(false);
      autoScrollEnabledRef.current = true;
      shouldScrollToBottomRef.current = false;
      isStartingNewChat.current = false;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [sessionId]);

  /**
   * 当消息加载完成且存在待高亮消息 ID 时，滚动到对应消息位置并添加高亮效果。
   */
  useEffect(() => {
    if (!highlightMessageId || messages.length === 0) {
      return;
    }

    const messageIdStr = String(highlightMessageId);
    const targetElement = messageRefs.current[messageIdStr];
    if (!targetElement) {
      return;
    }

    // 延迟一帧等待渲染完成
    const rafId = requestAnimationFrame(() => {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetElement.classList.add(styles.highlightMessage);
      setTimeout(() => {
        targetElement.classList.remove(styles.highlightMessage);
      }, 2500);
    });

    return () => cancelAnimationFrame(rafId);
  }, [highlightMessageId, messages]);

  /**
   * 布局阶段根据标记将聊天区域滚动至底部，确保新消息或切换会话时视图对齐。
   */
  useLayoutEffect(() => {
    if (messages.length === 0) {
      return;
    }

    if (shouldScrollToBottomRef.current) {
      scheduleScrollToBottom('auto');
      shouldScrollToBottomRef.current = false;
      return;
    }

    if (isStreamingRef.current && autoScrollEnabledRef.current) {
      scheduleScrollToBottom('auto');
    }
  }, [messages]);

  /**
   * 监听用户手动滚动行为：当用户上滑查看历史时停止自动滚动到底部。
   */
  useEffect(() => {
    const element = chatAreaRef.current;
    if (!element) {
      return undefined;
    }

    const stopAutoScrollByUser = () => {
      autoScrollEnabledRef.current = false;
      cancelScheduledScroll();
    };

    const handleWheel = (event: WheelEvent) => {
      if (!isStreamingRef.current) {
        return;
      }

      if (event.deltaY < 0) {
        stopAutoScrollByUser();
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isStreamingRef.current) {
        return;
      }

      const currentY = event.touches[0]?.clientY;
      const startY = touchStartYRef.current;
      if (typeof currentY !== 'number' || typeof startY !== 'number') {
        return;
      }

      if (currentY > startY) {
        stopAutoScrollByUser();
      }
    };

    const handleTouchEnd = () => {
      touchStartYRef.current = null;
    };

    element.addEventListener('wheel', handleWheel, { passive: true });
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    return () => {
      streamControllerRef.current?.abort();
      cancelScheduledScroll();
    };
  }, []);

  const currentAnchorId =
    activeAnchorId && anchorItems.some((anchor) => anchor.id === activeAnchorId)
      ? activeAnchorId
      : (anchorItems[anchorItems.length - 1]?.id ?? '');

  return (
    <div
      className={classNames(styles.container, {
        [styles.welcomeMode]: messages.length === 0 && !isLoading,
        [styles.panelOpen]: isCitationPanelVisible,
      })}
    >
      {/* 会话标题栏：固定高度并置于滚动区域上方，始终显示在最顶部且不被消息遮挡 */}
      {messages.length > 0 && !isLoading && (
        <div className={classNames(styles.versionHeader, { [styles.collapsedHeader]: isCollapsed })}>
          <div className={styles.versionInfo}>
            <span className={styles.versionTitle}>{currentSessionTitle || '\u65b0\u4f1a\u8bdd'}</span>
            <span className={styles.versionModel}>
              <Zap size={14} className={styles.versionIcon} />
              {'deepseek-v4-flash'}
            </span>
          </div>
          <button
            type="button"
            className={styles.versionShareBtn}
            title={'\u5206\u4eab\u4f1a\u8bdd'}
            aria-label={'\u5206\u4eab\u4f1a\u8bdd'}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setToast({ message: '\u529f\u80fd\u5f00\u53d1\u4e2d', type: 'info' });
            }}
          >
            <Share2 size={16} />
          </button>
        </div>
      )}

      <div className={styles.chatArea} ref={chatAreaRef} onScroll={handleScroll}>
        {isLoading ? (
          <div className={styles.loadingWrapper} />
        ) : messages.length === 0 ? (
          <div className={styles.welcomeContent}>
            <ChatWelcome />
            <div className={styles.welcomeInput}>
              <ChatInput
                onSend={handleSend}
                sessionId={sessionId}
                initialDeepThink={isDeepThink}
                initialSearch={isSearch}
                onToggleDeepThink={setIsDeepThink}
                onToggleSearch={setIsSearch}
                autoFocus={shouldFocus}
              />
            </div>
          </div>
        ) : (
          <div className={styles.messagesList}>
            {messages.map((message) => (
              <div
                key={message.id}
                ref={getMessageRefCallback(message.id)}
              >
                <ChatMessage
                  message={message}
                  onEditSendMessage={handleEditSend}
                  onRegenerate={() => handleRegenerate(message.id)}
                  onContinueGenerate={() => handleContinueGenerate(message.id)}
                  onOpenCitations={handleOpenCitations}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {messages.length > 0 && showScrollButton && (
        <button
          className={styles.scrollDownButton}
          onClick={() => {
            autoScrollEnabledRef.current = true;
            scheduleScrollToBottom('smooth');
          }}
          title={'\u6eda\u52a8\u5230\u5e95\u90e8'}
        >
          <ArrowDown size={18} />
        </button>
      )}

      {!isCitationPanelVisible && (
        <div className={styles.anchorContainer}>
          <ChatAnchor items={anchorItems} currentId={currentAnchorId} onAnchorClick={handleAnchorClick} />
        </div>
      )}

      {messages.length > 0 && (
        <div className={styles.inputArea}>
          <ChatInput
            onSend={handleSend}
            sessionId={sessionId}
            isStreaming={isStreaming}
            onStop={() => {
              void stopCurrentStream();
            }}
            initialDeepThink={isDeepThink}
            initialSearch={isSearch}
            onToggleDeepThink={setIsDeepThink}
            onToggleSearch={setIsSearch}
          />
          <p className={styles.disclaimer}>{requestError ? '\u8bf7\u6c42\u5f02\u5e38\uff1a' + requestError : '\u5185\u5bb9\u7531 AI \u751f\u6210\uff0c\u8bf7\u4ed4\u7ec6\u7504\u522b'}</p>


        </div>
      )}

      {messages.length === 0 && requestError && (
        <div className={styles.inputArea}>
          <p className={styles.disclaimer}>{'\u8bf7\u6c42\u5f02\u5e38\uff1a' + requestError}</p>
        </div>
      )}

      {citationPanelState && (
        <>
          {isCitationPanelVisible && (
            <button
              type="button"
              className={styles.panelBackdrop}
              onClick={handleCloseCitations}
              aria-label={'\u5173\u95ed\u6765\u6e90\u4fa7\u680f\u906e\u7f69'}
            />
          )}
          <ChatCitationPanel
            visible={isCitationPanelVisible}
            citations={citationPanelState.citations || []}
            searchStatus={citationPanelState.searchStatus}
            activeCitationId={citationPanelState.activeCitationId}
            onClose={handleCloseCitations}
          />
        </>
      )}

      {/* 顶部提示：分享等功能暂未开放时显示，3 秒后由 Toast 组件自动消失 */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
};

export default ChatMain;
