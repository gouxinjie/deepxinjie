/**
 * @component ChatMessage
 * @description 聊天消息组件，负责渲染用户消息、模型回答、推理过程和消息操作
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-10
 */
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  Download,
  Pencil,
  Play,
  RotateCcw,
  Search,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import classNames from 'classnames';

import styles from './ChatMessage.module.scss';
import type { Message } from '../../types/chat';
import TypingIndicator from '../commons/TypingIndicator';

interface ChatMessageProps {
  /** 当前消息 */
  message: Message;
  /** 将编辑后的内容作为新消息发送的回调 */
  onEditSendMessage?: (newContent: string) => Promise<boolean>;
  /** 重新生成回调 */
  onRegenerate?: () => void;
  /** 继续生成回调 */
  onContinueGenerate?: () => void;
  /** 打开来源侧栏回调 */
  onOpenCitations?: (payload: { message: Message; activeCitationId?: number }) => void;
}

interface CodeProps {
  /** 节点内容 */
  children?: React.ReactNode;
  /** 代码块样式类名 */
  className?: string;
  /** 是否为行内代码 */
  inline?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onEditSendMessage,
  onRegenerate,
  onContinueGenerate,
  onOpenCitations,
}) => {
  const isUser = message.role === 'user';
  const [isReasoningOpen, setIsReasoningOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [reasoningSeconds, setReasoningSeconds] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isDisliked, setIsDisliked] = useState(false);
  const [isEditSending, setIsEditSending] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const isStreaming = message.status === 'streaming';
  const isStopped = message.status === 'stopped';
  const isCompleted = !message.status || message.status === 'completed';
  const isDeepThinkMessage = Boolean(message.reasoning?.trim()) || Boolean(message.isThinking) || (message.thinkingTime ?? 0) > 0;

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

  const handleCitationJump = (citationId: number) => {
    if (!message.citations || message.citations.length === 0) {
      return;
    }

    onOpenCitations?.({ message, activeCitationId: citationId });
  };

  const contentWithCitationLinks = message.citations?.length
    ? message.content.replace(/\[来源(\d+)\]/g, (_match, citationIdText: string) => {
        const citationId = Number.parseInt(citationIdText, 10);
        const hasCitation = message.citations?.some((citation) => citation.id === citationId);
        return hasCitation ? `[来源${citationId}](#citation-${citationId})` : `[来源${citationId}]`;
      })
    : message.content;

  const syncEditTextareaHeight = () => {
    const element = editTextareaRef.current;
    if (!element) {
      return;
    }

    const maxHeight = 180;
    element.style.height = 'auto';
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    if (isEditing) {
      syncEditTextareaHeight();
    }
  }, [editValue, isEditing]);

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

  const sendEdit = async () => {
    const nextValue = editValue.trim();
    if (!nextValue || !onEditSendMessage || isEditSending) {
      return;
    }

    setIsEditSending(true);
    try {
      const success = await onEditSendMessage(nextValue);
      if (success) {
        setIsEditing(false);
      }
    } finally {
      setIsEditSending(false);
    }
  };

  const CodeBlock = ({ children, className, ...props }: CodeProps & React.ComponentPropsWithoutRef<'code'>) => {
    const [isCodeCopied, setIsCodeCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const code = String(children).replace(/\n$/, '');

    const handleCopyCode = async () => {
      await navigator.clipboard.writeText(code);
      setIsCodeCopied(true);
      window.setTimeout(() => setIsCodeCopied(false), 2000);
    };

    const handleDownloadCode = () => {
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `code-${Date.now()}.${language || 'txt'}`;
      anchor.click();
      URL.revokeObjectURL(url);
    };

    if (!className) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    return (
      <div className={styles.codeBlockContainer}>
        <div className={styles.codeBlockHeader}>
          <span className={styles.codeLanguage}>{language || 'code'}</span>
          <div className={styles.codeActions}>
            <button className={styles.codeActionBtn} onClick={handleCopyCode}>
              {isCodeCopied ? <Check size={14} /> : <Copy size={14} />}
              <span>{isCodeCopied ? '已复制' : '复制'}</span>
            </button>
            <button className={styles.codeActionBtn} onClick={handleDownloadCode}>
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
                {message.isThinking
                  ? '正在思考'
                  : reasoningSeconds > 0
                    ? `已思考（用时 ${reasoningSeconds} 秒）`
                    : '已思考'}
              </span>
              <div className={classNames(styles.chevron, { [styles.rotated]: !isReasoningOpen })}>
                <ChevronDown size={14} />
              </div>
            </div>

            {isReasoningOpen && message.reasoning && (
              <div className={styles.reasoningContent}>{message.reasoning}</div>
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
                onChange={(event) => {
                  setEditValue(event.target.value);
                }}
                rows={1}
                autoFocus
              />
              <div className={styles.editButtons}>
                <button className={styles.editCancelBtn} onClick={cancelEdit} disabled={isEditSending}>
                  取消
                </button>
                <button className={styles.editSendBtn} onClick={() => void sendEdit()} disabled={isEditSending}>
                  {isEditSending ? '发送中...' : '发送'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.userBubble}>{message.content}</div>
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
            {message.searchStatus &&
              (message.citations && message.citations.length > 0 ? (
                <button
                  type="button"
                  className={styles.searchStatusButton}
                  onClick={() => onOpenCitations?.({ message })}
                  title="查看联网来源"
                >
                  <Search size={14} strokeWidth={2} />
                  {message.searchStatus}
                </button>
              ) : (
                <div className={styles.searchStatus}>{message.searchStatus}</div>
              ))}
            {message.content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  a: ({ href, children, ...props }) => {
                    if (href?.startsWith('#citation-')) {
                      const matchedId = href.match(/#citation-(\d+)$/);
                      const citationId = matchedId ? Number.parseInt(matchedId[1], 10) : NaN;

                      return (
                        <button
                          type="button"
                          className={styles.inlineCitationLink}
                          onClick={() => {
                            if (!Number.isNaN(citationId)) {
                              handleCitationJump(citationId);
                            }
                          }}
                        >
                          {children}
                        </button>
                      );
                    }

                    return (
                      <a href={href} {...props}>
                        {children}
                      </a>
                    );
                  },
                  code: CodeBlock,
                }}
              >
                {contentWithCitationLinks}
              </ReactMarkdown>
            ) : (message.isLoading || (isStreaming && !message.content)) && <TypingIndicator />}
          </div>
        )}

        {!isUser && (message.content.length > 0 || isStopped) && !message.isThinking && (
          <>
            <p className={styles.disclaimer}>
              {isStopped
                ? isDeepThinkMessage
                  ? '本次回答已停止。'
                  : '本次回答已停止，你可以继续生成。'
                : '本回答由 AI 生成，内容仅供参考，请仔细甄别。'}
            </p>

            <div className={styles.actions}>
              {message.content.length > 0 && (
                <>
                  <button className={styles.actionBtn} onClick={handleCopy} title="复制">
                    {copied ? <Check size={16} className={styles.activeIcon} /> : <Copy size={16} />}
                  </button>
                  {message.citations && message.citations.length > 0 && (
                    <button className={styles.actionBtn} onClick={() => onOpenCitations?.({ message })} title="查看来源">
                      <Search size={16} />
                    </button>
                  )}
                  <button
                    className={classNames(styles.actionBtn, { [styles.active]: isLiked })}
                    onClick={() => {
                      setIsLiked(!isLiked);
                      if (isDisliked) {
                        setIsDisliked(false);
                      }
                    }}
                    title="点赞"
                  >
                    <ThumbsUp size={16} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className={classNames(styles.actionBtn, { [styles.active]: isDisliked })}
                    onClick={() => {
                      setIsDisliked(!isDisliked);
                      if (isLiked) {
                        setIsLiked(false);
                      }
                    }}
                    title="点踩"
                  >
                    <ThumbsDown size={16} fill={isDisliked ? 'currentColor' : 'none'} />
                  </button>
                </>
              )}
              {isStopped && !isDeepThinkMessage && (
                <button
                  className={classNames(styles.actionBtn, styles.continueBtn, styles.actionAlignEnd)}
                  onClick={onContinueGenerate}
                  title="继续生成"
                >
                  <Play size={15} />
                  <span>继续生成</span>
                </button>
              )}
              {(isCompleted || isStopped) && (
                <button className={styles.actionBtn} onClick={onRegenerate} title="重新生成">
                  <RotateCcw size={16} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
