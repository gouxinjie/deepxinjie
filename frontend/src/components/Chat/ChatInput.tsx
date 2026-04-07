/**
 * @component 聊天输入框组件
 * @description 处理用户输入、深度思考/智能搜索切换及消息发送
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-03-17
 */
import React, { useState, useRef, useEffect } from "react";
import styles from "./ChatInput.module.scss";
import { Paperclip, ArrowUp, Globe, Brain } from "lucide-react";
import classNames from "classnames";
import useMobile from "../../hooks/useMobile";

interface ChatInputProps {
  /** 发送消息回调 */
  onSend: (message: string, isDeepThink: boolean, isSearch: boolean) => void;
  /** 初始深度思考状态 */
  initialDeepThink?: boolean;
  /** 初始智能搜索状态 */
  initialSearch?: boolean;
  /** 状态改变回调 */
  onToggleDeepThink?: (val: boolean) => void;
  /** 状态改变回调 */
  onToggleSearch?: (val: boolean) => void;
  /** 是否自动聚焦 */
  autoFocus?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  initialDeepThink = false,
  initialSearch = false,
  onToggleDeepThink,
  onToggleSearch,
  autoFocus = false
}) => {
  const [message, setMessage] = useState("");
  const [isDeepThink, setIsDeepThink] = useState(initialDeepThink);
  const [isSearch, setIsSearch] = useState(initialSearch);
  const [toast, setToast] = useState<{ message: string; type: "info" | "success" | "error" } | null>(null);
  const isMobile = useMobile();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 3秒后自动关闭提示弹窗
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // 同步外部状态变化
  useEffect(() => {
    setIsDeepThink(initialDeepThink);
  }, [initialDeepThink]);

  useEffect(() => {
    setIsSearch(initialSearch);
  }, [initialSearch]);

  /** 处理发送逻辑 */
  const handleSend = () => {
    if (message.trim()) {
      onSend(message, isDeepThink, isSearch);
      setMessage("");
      // 发送后重置高度
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  /** 处理键盘快捷键 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** 自动调整文本框高度 */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const toggleDeepThink = () => {
    const newVal = !isDeepThink;
    setIsDeepThink(newVal);
    onToggleDeepThink?.(newVal);
  };

  const toggleSearch = () => {
    const newVal = !isSearch;
    setIsSearch(newVal);
    onToggleSearch?.(newVal);
  };

  return (
    <div className={styles.container}>
      <div className={styles.inputWrapper}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="给 DeepXinjie 发送消息"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={isMobile ? 1 : 2}
        />

        <div className={styles.controls}>
          <div className={styles.toggles}>
            <button
              className={classNames(styles.toggleBtn, styles.deepThink, { [styles.active]: isDeepThink })}
              onClick={toggleDeepThink}
              title="深度思考 (R1)"
            >
              <Brain size={16} strokeWidth={1.5} />
              <span>深度思考</span>
            </button>
            <button className={classNames(styles.toggleBtn, styles.search, { [styles.active]: isSearch })} onClick={toggleSearch} title="智能搜索">
              <Globe size={16} strokeWidth={1.5} />
              <span>智能搜索</span>
            </button>
          </div>

          <div className={styles.actions}>
            <button 
              className={styles.attachBtn} 
              title="上传文件"
              onClick={() => setToast({ message: "功能开发中", type: "info" })}
            >
              <Paperclip size={20} strokeWidth={1.5} />
            </button>
            <button
              className={classNames(styles.sendBtn, { [styles.hasContent]: message.trim() })}
              onClick={handleSend}
              disabled={!message.trim()}
              title="发送"
            >
              <ArrowUp size={20} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
      
      {toast && <div className={classNames(styles.toast, styles[toast.type])}>{toast.message}</div>}
    </div>
  );
};

export default ChatInput;
