/**
 * @component ChatMain
 * @description 聊天主内容区域组件，负责消息加载、发送、流式渲染与来源侧栏联动
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-08
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import classNames from 'classnames';
import { useNavigate, useParams } from 'react-router-dom';

import styles from './ChatMain.module.scss';
import ChatAnchor from './ChatAnchor';
import ChatCitationPanel from './ChatCitationPanel';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import ChatWelcome from './ChatWelcome';
import { extractApiErrorMessage, sendChatStream, sessionApi } from '../../services/api';
import type { Message } from '../../types/chat';
import type { ChatStreamChunk, MessageRecord } from '../../types/api';

interface ChatMainProps {
  /** 是否开启深度思考 */
  isDeepThink: boolean;
  /** 更新深度思考状态 */
  setIsDeepThink: (val: boolean) => void;
  /** 是否开启联网搜索 */
  isSearch: boolean;
  /** 更新联网搜索状态 */
  setIsSearch: (val: boolean) => void;
}

interface CitationPanelState {
  /** 当前来源面板所属消息 ID */
  /** 当前来源列表 */
  citations: Message['citations'];
  /** 当前来源状态提示 */
  searchStatus?: string;
  /** 当前高亮来源编号 */
  activeCitationId?: number | null;
}

const ChatMain: React.FC<ChatMainProps> = ({
  isDeepThink,
  setIsDeepThink,
  isSearch,
  setIsSearch,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [shouldFocus, setShouldFocus] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [activeAnchorId, setActiveAnchorId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [citationPanelState, setCitationPanelState] = useState<CitationPanelState | null>(null);
  const [isCitationPanelVisible, setIsCitationPanelVisible] = useState(false);

  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isStartingNewChat = useRef(false);
  const streamControllerRef = useRef<AbortController | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const isStreamingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  /**
   * 基于用户消息生成锚点目录。
   */
  const anchorItems = useMemo(() => {
    return messages
      .filter((message) => message.role === 'user')
      .map((message, index) => {
        const normalized = message.content.replace(/\s+/g, ' ').trim();
        const title = normalized.length > 30 ? `${normalized.slice(0, 30)}...` : normalized;

        return {
          id: message.id,
          title: title || `问题 ${index + 1}`,
        };
      });
  }, [messages]);

  /**
   * 滚动到底部。
   * @param behavior - 滚动行为
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
   * 处理滚动事件，控制“回到底部”按钮及锚点高亮。
   */
  const handleScroll = () => {
    const chatElement = chatAreaRef.current;
    if (!chatElement) {
      return;
    }

    const nearBottom = isNearBottom(chatElement, 40);
    setShowScrollButton(!nearBottom);

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

    setActiveAnchorId(currentAnchor);
  };

  /**
   * 点击锚点后滚动到对应消息。
   * @param messageId - 目标消息 ID
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
   * 打开右侧来源侧栏。
   * @param payload - 来源侧栏数据
   */
  const handleOpenCitations = (payload: { message: Message; activeCitationId?: number }) => {
    setCitationPanelState({
      citations: payload.message.citations,
      searchStatus: payload.message.searchStatus,
      activeCitationId: payload.activeCitationId ?? null,
    });
  };

  /**
   * 关闭右侧来源侧栏。
   */
  const handleCloseCitations = () => {
    setIsCitationPanelVisible(false);
  };

  /**
   * 在关闭动画完成后再卸载来源侧栏。
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
   * 来源侧栏挂载后延迟一帧再显示，确保移动端底部弹层过渡动画生效。
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
   * 来源侧栏打开时支持通过 Esc 快捷关闭。
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
   * 将后端消息结构映射为前端展示结构。
   * @param records - 后端返回的消息数组
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
    }));
  };

  /**
   * 加载指定会话的历史消息。
   * @param id - 会话 ID
   */
  const loadMessages = async (id: number) => {
    setIsLoading(true);
    setRequestError('');

    try {
      const response = await sessionApi.getMessages(id);
      if (response.data.success) {
        shouldScrollToBottomRef.current = true;
        autoScrollEnabledRef.current = true;
        setMessages(formatMessages(response.data.data.messages));
        setCitationPanelState(null);
        setIsCitationPanelVisible(false);
        return;
      }

      setMessages([]);
      setRequestError(response.data.message);
    } catch (error) {
      setMessages([]);
      setRequestError(extractApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 更新流式中的 AI 占位消息。
   * @param aiMessageId - AI 消息临时 ID
   * @param chunk - 流式分片
   */
  const applyStreamChunk = (aiMessageId: string, chunk: ChatStreamChunk) => {
    setMessages((prev) => {
      const nextMessages = [...prev];
      const targetIndex = nextMessages.findIndex((item) => item.id === aiMessageId);

      if (targetIndex === -1) {
        return prev;
      }

      const nextMessage = { ...nextMessages[targetIndex] };

      if (chunk.reasoning) {
        nextMessage.reasoning = `${nextMessage.reasoning || ''}${chunk.reasoning}`;
        nextMessage.isThinking = true;
        nextMessage.isLoading = false;
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
      }

      nextMessages[targetIndex] = nextMessage;
      return nextMessages;
    });
  };

  /**
   * 结束流式状态并更新占位消息。
   * @param aiMessageId - AI 消息临时 ID
   * @param fallbackContent - 流式失败时用于回填的错误文案
   */
  const finishStreamingMessage = (aiMessageId: string, fallbackContent?: string) => {
    setMessages((prev) => {
      const nextMessages = [...prev];
      const targetIndex = nextMessages.findIndex((item) => item.id === aiMessageId);

      if (targetIndex === -1) {
        return prev;
      }

      const nextMessage = { ...nextMessages[targetIndex] };
      nextMessage.isLoading = false;
      nextMessage.isThinking = false;

      if (fallbackContent && !nextMessage.content) {
        nextMessage.content = fallbackContent;
      }

      nextMessages[targetIndex] = nextMessage;
      return nextMessages;
    });
  };

  /**
   * 启动一次新的流式对话。
   */
  const startStream = async (options: {
    content: string;
    sessionId: number;
    isDeepThinkEnabled: boolean;
    isSearchEnabled: boolean;
    buildNextMessages: (prev: Message[], aiMessageId: string) => Message[];
    onOpen?: () => void;
    onRequestError?: () => void;
  }) => {
    const aiMessageId = crypto.randomUUID();
    const controller = new AbortController();
    let hasOpened = false;

    streamControllerRef.current?.abort();
    streamControllerRef.current = controller;
    setRequestError('');
    isStreamingRef.current = true;
    autoScrollEnabledRef.current = true;
    shouldScrollToBottomRef.current = true;

    setMessages((prev) => options.buildNextMessages(prev, aiMessageId));

    try {
      await sendChatStream({
        payload: {
          content: options.content,
          is_deepthink: options.isDeepThinkEnabled,
          is_search: options.isSearchEnabled,
          session_id: options.sessionId,
        },
        onOpen: () => {
          hasOpened = true;
          options.onOpen?.();
        },
        signal: controller.signal,
        onChunk: (chunk) => {
          applyStreamChunk(aiMessageId, chunk);
        },
      });

      finishStreamingMessage(aiMessageId);
    } catch (error) {
      if (controller.signal.aborted) {
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
      finishStreamingMessage(aiMessageId, `请求失败：${errorMessage}`);
    } finally {
      if (streamControllerRef.current === controller) {
        isStreamingRef.current = false;
        streamControllerRef.current = null;
      }
    }
  };

  /**
   * 发送消息。
   * @param content - 用户输入内容
   * @param isDeepThinkEnabled - 是否启用深度思考
   * @param isSearchEnabled - 是否启用联网搜索
   */
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
        isStartingNewChat.current = true;
        navigate(`/chat/${currentSessionId}`, { replace: true });
      } catch (error) {
        setRequestError(extractApiErrorMessage(error));
        return false;
      }
    }

    if (!currentSessionId) {
      setRequestError('创建会话失败');
      return false;
    }

    shouldScrollToBottomRef.current = true;
    autoScrollEnabledRef.current = true;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

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
   * 基于上一条用户消息重新生成回答。
   * @param messageId - 当前 AI 消息 ID
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
        },
      ],
    });
  };

  /**
   * 将编辑后的内容作为一条新的用户消息追加发送。
   * @param newContent - 编辑后的消息内容
   * @returns 是否成功发起发送
   */
  const handleEditSend = async (newContent: string): Promise<boolean> => {
    const nextContent = newContent.trim();
    if (!nextContent) {
      return false;
    }

    if (isStreamingRef.current) {
      setRequestError('当前回答生成中，请等待完成后再发送编辑后的内容');
      return false;
    }

    return handleSend(nextContent, isDeepThink, isSearch);
  };

  /**
   * 新会话页面自动聚焦输入框。
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
   * 会话切换时加载对应消息。
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
      autoScrollEnabledRef.current = true;
      shouldScrollToBottomRef.current = false;
      isStartingNewChat.current = false;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [sessionId]);

  /**
   * 消息变化后自动滚动到底部。
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
   * 组件卸载时中断仍在进行中的流式请求。
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
      <div className={styles.chatArea} ref={chatAreaRef} onScroll={handleScroll}>
        {isLoading ? (
          <div className={styles.loadingWrapper} />
        ) : messages.length === 0 ? (
          <div className={styles.welcomeContent}>
            <ChatWelcome />
            <div className={styles.welcomeInput}>
              <ChatInput
                onSend={handleSend}
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
                ref={(element) => {
                  messageRefs.current[message.id] = element;
                }}
              >
                <ChatMessage
                  message={message}
                  onEditSendMessage={handleEditSend}
                  onRegenerate={() => handleRegenerate(message.id)}
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
          title="滚动到底部"
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
            initialDeepThink={isDeepThink}
            initialSearch={isSearch}
            onToggleDeepThink={setIsDeepThink}
            onToggleSearch={setIsSearch}
          />
          <p className={styles.disclaimer}>
            {requestError ? `请求异常：${requestError}` : '内容由 AI 生成，请仔细甄别'}
          </p>
        </div>
      )}

      {messages.length === 0 && requestError && (
        <div className={styles.inputArea}>
          <p className={styles.disclaimer}>请求异常：{requestError}</p>
        </div>
      )}

      {citationPanelState && (
        <>
          <button
            type="button"
            className={styles.panelBackdrop}
            onClick={handleCloseCitations}
            aria-label="关闭来源侧栏遮罩"
          />
          <ChatCitationPanel
            visible={isCitationPanelVisible}
            citations={citationPanelState.citations || []}
            searchStatus={citationPanelState.searchStatus}
            activeCitationId={citationPanelState.activeCitationId}
            onClose={handleCloseCitations}
          />
        </>
      )}
    </div>
  );
};

export default ChatMain;
