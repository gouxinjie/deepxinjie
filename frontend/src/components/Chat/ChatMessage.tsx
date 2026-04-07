import React, { useEffect, useRef, useState } from 'react';
import styles from './ChatMessage.module.scss';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // 代码高亮主题样式
import { Copy, ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, Brain, Pencil, Download, Check, Share2 } from 'lucide-react';
import classNames from 'classnames';
import type { Message } from '../../types/chat';
import TypingIndicator from '../commons/TypingIndicator';

interface ChatMessageProps {
  message: Message;
  onEditUserMessage?: (messageId: string, newContent: string) => void;
  onRegenerate?: () => void;
}

interface CodeProps {
  /** 节点内容 */
  children?: React.ReactNode;
  /** 样式类名，通常包含语言信息 */
  className?: string;
  /** 是否为行内代码 */
  inline?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onEditUserMessage, onRegenerate }) => {
  const isUser = message.role === 'user';
  const [isReasoningOpen, setIsReasoningOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [reasoningSeconds, setReasoningSeconds] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (message.isThinking) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
        setReasoningSeconds(0);
      }
      
      if (!timerRef.current) {
        timerRef.current = window.setInterval(() => {
          if (startTimeRef.current) {
            setReasoningSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // If we have a persisted thinkingTime, use it
      if (message.thinkingTime !== undefined) {
        setReasoningSeconds(message.thinkingTime);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [message.isThinking, message.thinkingTime]);

  const syncEditTextareaHeight = () => {
    const el = editTextareaRef.current;
    if (!el) return;
    const maxHeight = 180;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    if (isEditing) {
      syncEditTextareaHeight();
    }
  }, [isEditing, editValue]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message.content;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const startEdit = () => {
    setEditValue(message.content);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditValue(message.content);
  };

  const sendEdit = () => {
    const next = editValue.trim();
    if (!next) return;
    onEditUserMessage?.(message.id, next);
    setIsEditing(false);
  };

  /** 自定义代码块组件，包含语言显示、复制和下载功能 */
  const CodeBlock = ({ children, className, ...props }: CodeProps & React.ComponentPropsWithoutRef<'code'>) => {
    const [copied, setCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const code = String(children).replace(/\n$/, '');

    const handleCopy = async () => {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `code-${Date.now()}.${language || 'txt'}`;
      a.click();
      URL.revokeObjectURL(url);
    };

    // 如果没有 className，说明是行内代码
    if (!className) {
      return <code className={className} {...props}>{children}</code>;
    }

    return (
      <div className={styles.codeBlockContainer}>
        <div className={styles.codeBlockHeader}>
          <span className={styles.codeLanguage}>{language || 'code'}</span>
          <div className={styles.codeActions}>
            <button className={styles.codeActionBtn} onClick={handleCopy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
            <button className={styles.codeActionBtn} onClick={handleDownload}>
              <Download size={14} />
              <span>下载</span>
            </button>
          </div>
        </div>
        <pre className={className}>
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  };

  return (
    <div className={classNames(styles.container, { [styles.user]: isUser, [styles.assistant]: !isUser })}>
      <div className={styles.contentWrapper}>
        {!isUser && (message.reasoning || message.isThinking) && (
          <div className={styles.reasoning}>
            <div 
              className={classNames(styles.reasoningHeader, { [styles.thinking]: message.isThinking })} 
              onClick={() => setIsReasoningOpen(!isReasoningOpen)}
            >
              <div className={classNames(styles.brainIcon, { [styles.pulsing]: message.isThinking })}>
                <Brain size={16} />
              </div>
              <span className={styles.reasoningText}>
                {message.isThinking ? '正在思考' : (reasoningSeconds > 0 ? `已思考 （用时 ${reasoningSeconds} 秒）` : '已思考')}
              </span>
              <div className={classNames(styles.chevron, { [styles.rotated]: !isReasoningOpen })}>
                <ChevronDown size={14} />
              </div>
            </div>
            
            {isReasoningOpen && message.reasoning && (
              <div className={styles.reasoningContent}>
                {message.reasoning}
              </div>
            )}
          </div>
        )}

        {isUser ? (
          isEditing ? (
            <div className={styles.editPanel}>
              <textarea
                ref={editTextareaRef}
                className={styles.editTextarea}
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                }}
                rows={1}
                autoFocus
              />
              <div className={styles.editButtons}>
                <button className={styles.editCancelBtn} onClick={cancelEdit}>
                  取消
                </button>
                <button className={styles.editSendBtn} onClick={sendEdit}>
                  发送
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.userBubble}>
                {message.content}
              </div>
              <div className={styles.userActions}>
                {copied && <span className={styles.copyTip}>复制成功</span>}
                <button className={styles.userActionBtn} onClick={handleCopy} aria-label="复制">
                  <Copy size={16} />
                </button>
                <button className={styles.userActionBtn} onClick={startEdit} aria-label="编辑">
                  <Pencil size={16} />
                </button>
              </div>
            </>
          )
        ) : (
          <div className={styles.messageContent}>
            {message.content ? (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]} 
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code: CodeBlock
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (message.isLoading || (!message.isThinking && message.content.length === 0)) && (
              <TypingIndicator />
            )}
          </div>
        )}

        {!isUser && message.content.length > 0 && !message.isThinking && (
          <>
            <p className={styles.disclaimer}>
              本回答由 AI 生成，内容仅供参考，请仔细甄别。
            </p>
            
            <div className={styles.actions}>
              <button className={styles.actionBtn} onClick={handleCopy} title="复制">
                {copied ? <Check size={16} className={styles.activeIcon} /> : <Copy size={16} />}
              </button>
              <button className={styles.actionBtn} onClick={onRegenerate} title="重新生成">
                <RotateCcw size={16} />
              </button>
              <button 
                className={classNames(styles.actionBtn, { [styles.active]: isLiked })} 
                onClick={() => { setIsLiked(!isLiked); if (isDisliked) setIsDisliked(false); }} 
                title="点赞"
              >
                <ThumbsUp size={16} fill={isLiked ? "currentColor" : "none"} />
              </button>
              <button 
                className={classNames(styles.actionBtn, { [styles.active]: isDisliked })} 
                onClick={() => { setIsDisliked(!isDisliked); if (isLiked) setIsLiked(false); }} 
                title="踩"
              >
                <ThumbsDown size={16} fill={isDisliked ? "currentColor" : "none"} />
              </button>
              <button className={styles.actionBtn} title="分享">
                <Share2 size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
