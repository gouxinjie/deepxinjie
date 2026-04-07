/**
 * @component ChatMain
 * @description 聊天主内容区域，负责消息加载、发送、流式渲染、会话切换与来源侧栏联动
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-07
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import classNames from 'classnames';
import { useNavigate, useParams } from 'react-router-dom';

import styles from './ChatMain.module.scss';
import ChatAnchor from './ChatAnchor';
import ChatCitationPanel from './ChatCitationPanel';
import ChatInput from './ChatInput';
import ChatMessage from './ChatMessage';
import ChatWelcome from './ChatWelcome';
import { extractApiErrorMessage, messageApi, sendChatStream, sessionApi } from '../../services/api';
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
  messageId: string;
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const shouldScrollInstant = useRef(false);
  const isStartingNewChat = useRef(false);
  const streamControllerRef = useRef<AbortController | null>(null);

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
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  /**
   * 处理滚动事件，控制“回到底部”按钮及锚点高亮。
   */
  const handleScroll = () => {
    if (!chatAreaRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = chatAreaRef.current;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);

    if (anchorItems.length === 0) {
      return;
    }

    const containerTop = chatAreaRef.current.getBoundingClientRect().top;
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
      messageId: payload.message.id,
      citations: payload.message.citations,
      searchStatus: payload.message.searchStatus,
      activeCitationId: payload.activeCitationId ?? null,
    });
    setIsCitationPanelVisible(true);
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
        shouldScrollInstant.current = true;
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
  }) => {
    const aiMessageId = crypto.randomUUID();
    const controller = new AbortController();

    streamControllerRef.current?.abort();
    streamControllerRef.current = controller;
    setRequestError('');

    setMessages((prev) => options.buildNextMessages(prev, aiMessageId));

    try {
      await sendChatStream({
        payload: {
          content: options.content,
          is_deepthink: options.isDeepThinkEnabled,
          is_search: options.isSearchEnabled,
          session_id: options.sessionId,
        },
        signal: controller.signal,
        onChunk: (chunk) => {
          applyStreamChunk(aiMessageId, chunk);
        },
      });

      finishStreamingMessage(aiMessageId);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const errorMessage = extractApiErrorMessage(error);
      setRequestError(errorMessage);
      finishStreamingMessage(aiMessageId, `请求失败：${errorMessage}`);
    } finally {
      if (streamControllerRef.current === controller) {
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
  ) => {
    let currentSessionId = sessionId ? Number.parseInt(sessionId, 10) : undefined;

    if (!currentSessionId) {
      try {
        const title = content.length > 20 ? `${content.slice(0, 20)}...` : content;
        const response = await sessionApi.create(title);

        if (!response.data.success) {
          setRequestError(response.data.message);
          return;
        }

        currentSessionId = response.data.data.session_id;
        isStartingNewChat.current = true;
        navigate(`/chat/${currentSessionId}`, { replace: true });
      } catch (error) {
        setRequestError(extractApiErrorMessage(error));
        return;
      }
    }

    if (!currentSessionId) {
      setRequestError('创建会话失败');
      return;
    }

    shouldScrollInstant.current = true;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
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

    shouldScrollInstant.current = true;
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
   * 编辑用户消息内容。
   * @param messageId - 消息 ID
   * @param newContent - 新内容
   */
  const handleEdit = async (messageId: string, newContent: string) => {
    try {
      const response = await messageApi.update(Number.parseInt(messageId, 10), newContent);
      if (response.data.success) {
        setMessages((prev) =>
          prev.map((message) => (message.id === messageId ? { ...message, content: newContent } : message)),
        );
        return;
      }

      setRequestError(response.data.message);
    } catch (error) {
      setRequestError(extractApiErrorMessage(error));
    }
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
      streamControllerRef.current?.abort();

      if (sessionId) {
        if (isStartingNewChat.current) {
          isStartingNewChat.current = false;
          return;
        }

        void loadMessages(Number.parseInt(sessionId, 10));
        return;
      }

      setRequestError('');
      setMessages([]);
      setIsLoading(false);
      setCitationPanelState(null);
      setIsCitationPanelVisible(false);
      isStartingNewChat.current = false;
    }, 0);

    return () => window.clearTimeout(timer);
  }, [sessionId]);

  /**
   * 消息变化后自动滚动到底部。
   */
  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    const behavior = shouldScrollInstant.current ? 'auto' : 'smooth';
    scrollToBottom(behavior);
    shouldScrollInstant.current = false;
  }, [messages]);

  /**
   * 组件卸载时中断仍在进行中的流式请求。
   */
  useEffect(() => {
    return () => {
      streamControllerRef.current?.abort();
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
                  onEditUserMessage={handleEdit}
                  onRegenerate={() => handleRegenerate(message.id)}
                  onOpenCitations={handleOpenCitations}
                />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {messages.length > 0 && showScrollButton && (
        <button
          className={styles.scrollDownButton}
          onClick={() => scrollToBottom('smooth')}
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
