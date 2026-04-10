/**
 * @component ChatInput
 * @description 聊天输入组件，负责处理用户输入、开关切换与消息发送
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-10
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Brain, Globe, Paperclip } from 'lucide-react';
import classNames from 'classnames';

import styles from './ChatInput.module.scss';
import useMobile from '../../hooks/useMobile';

interface ChatInputProps {
  /** 发送消息回调 */
  onSend: (message: string, isDeepThink: boolean, isSearch: boolean) => void;
  /** 是否处于流式生成状态 */
  isStreaming?: boolean;
  /** 停止生成回调 */
  onStop?: () => void;
  /** 初始深度思考状态 */
  initialDeepThink?: boolean;
  /** 初始联网搜索状态 */
  initialSearch?: boolean;
  /** 深度思考状态切换回调 */
  onToggleDeepThink?: (val: boolean) => void;
  /** 联网搜索状态切换回调 */
  onToggleSearch?: (val: boolean) => void;
  /** 是否自动聚焦 */
  autoFocus?: boolean;
}

type ToastState = {
  /** 提示文案 */
  message: string;
  /** 提示类型 */
  type: 'info' | 'success' | 'error';
};

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isStreaming = false,
  onStop,
  initialDeepThink = false,
  initialSearch = false,
  onToggleDeepThink,
  onToggleSearch,
  autoFocus = false,
}) => {
  const [message, setMessage] = useState('');
  const [isDeepThink, setIsDeepThink] = useState(initialDeepThink);
  const [isSearch, setIsSearch] = useState(initialSearch);
  const [toast, setToast] = useState<ToastState | null>(null);
  const isMobile = useMobile();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 同步输入框高度，确保桌面端与移动端切换时行数立即生效。
   */
  const syncTextareaHeight = () => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  };

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setIsDeepThink(initialDeepThink);
  }, [initialDeepThink]);

  useEffect(() => {
    setIsSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    syncTextareaHeight();
  }, [message]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      syncTextareaHeight();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isMobile]);

  /**
   * 处理发送逻辑。
   */
  const handleSend = () => {
    const nextMessage = message.trim();
    if (!nextMessage) {
      return;
    }

    onSend(nextMessage, isDeepThink, isSearch);
    setMessage('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  /**
   * 处理主操作按钮：非流式状态发送消息，流式状态停止生成。
   */
  const handlePrimaryAction = () => {
    if (isStreaming) {
      onStop?.();
      return;
    }

    handleSend();
  };

  /**
   * 处理快捷发送。
   * @param event - 键盘事件
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isStreaming) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  /**
   * 切换深度思考开关。
   */
  const toggleDeepThink = () => {
    const nextValue = !isDeepThink;
    setIsDeepThink(nextValue);
    onToggleDeepThink?.(nextValue);
  };

  /**
   * 切换联网搜索开关。
   */
  const toggleSearch = () => {
    const nextValue = !isSearch;
    setIsSearch(nextValue);
    onToggleSearch?.(nextValue);
  };

  return (
    <div className={styles.container}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="给 DeepXinjie 发送消息"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={isMobile ? 1 : 2}
        />

        <div className={styles.controls}>
          <div className={styles.toggles}>
            <button
              type="button"
              className={classNames(styles.toggleBtn, styles.deepThink, { [styles.active]: isDeepThink })}
              onClick={toggleDeepThink}
              title="深度思考"
            >
              <Brain size={16} strokeWidth={1.5} />
              <span>深度思考</span>
            </button>
            <button
              type="button"
              className={classNames(styles.toggleBtn, styles.search, { [styles.active]: isSearch })}
              onClick={toggleSearch}
              title="联网搜索"
            >
              <Globe size={16} strokeWidth={1.5} />
              <span>联网搜索</span>
            </button>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.attachBtn}
              title="上传文件"
              onClick={() => setToast({ message: '功能开发中', type: 'info' })}
            >
              <Paperclip size={20} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className={classNames(styles.sendBtn, {
                [styles.hasContent]: !isStreaming && Boolean(message.trim()),
                [styles.stopBtn]: isStreaming,
              })}
              onClick={handlePrimaryAction}
              disabled={!isStreaming && !message.trim()}
              title={isStreaming ? '停止生成' : '发送消息'}
            >
              {isStreaming ? <span className={styles.stopIcon} aria-hidden="true" /> : <ArrowUp size={20} strokeWidth={2} />}
            </button>
          </div>
        </div>
      </div>

      {toast && <div className={classNames(styles.toast, styles[toast.type])}>{toast.message}</div>}
    </div>
  );
};

export default ChatInput;
