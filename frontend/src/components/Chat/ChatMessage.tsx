/**
 * @component ChatMessage
 * @description 聊天消息组件，负责渲染用户消息、模型回答、推理过程和消息操作
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-07-30
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Mermaid from '../commons/Mermaid';
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
  /** 重新生成回调，接收待重新生成的消息 id */
  onRegenerate?: (messageId: string) => void;
  /** 继续生成回调，接收待继续生成的消息 id */
  onContinueGenerate?: (messageId: string) => void;
  /** 打开来源侧栏回调 */
  onOpenCitations?: (payload: { message: Message; activeCitationId?: number }) => void;
}

interface CodeBlockProps extends React.ComponentPropsWithoutRef<'code'> {
  /** 是否为行内代码 */
  inline?: boolean;
  /** 是否处于流式生成阶段（用于跳过 Mermaid 实时渲染，避免每分片重渲染昂贵 SVG） */
  isStreaming?: boolean;
}

/**
 * 递归提取 React 节点的纯文本内容
 * 用于复制 / 下载被 rehype-highlight 拆分为多个 span 元素的高亮代码
 * @param node - 任意 React 节点
 * @returns 拼接后的纯文本字符串
 */
const getNodeText = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => getNodeText(item)).join('');
  }
  if (React.isValidElement(node)) {
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
};

/**
 * 代码块内容组件（定义为模块级，避免每次父组件重渲染时重建组件类型导致子树卸载重挂）
 * 仅负责渲染 <code> 元素本身；容器、语言栏与复制 / 下载按钮统一由 CodeBlockContainer（pre 组件）处理。
 * 语言标识为 mermaid 时，直接使用 Mermaid 组件渲染图表。
 */
const CodeBlock: React.FC<CodeBlockProps> = ({ children, className, isStreaming = false, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  // mermaid 图表走专用组件渲染
  if (language === 'mermaid') {
    return <Mermaid chart={getNodeText(children)} isStreaming={isStreaming} />;
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

/**
 * 代码块容器组件（对应 Markdown 的 pre 元素，定义为模块级稳定组件）
 * 围栏代码块才会出现 pre，因此在此统一渲染语言栏 + 复制 / 下载按钮 + 内层 pre/code：
 * 1）让“未指定语言的围栏代码块”也能拥有代码块容器；
 * 2）避免原先 pre 组件直接包裹 div 造成的 <pre> 内嵌套 <div> 非法 HTML 结构。
 * 行内代码没有 pre 包裹，因此自然不会进入本组件，仍只渲染普通 <code>。
 */
const CodeBlockContainer: React.FC<React.PropsWithChildren<{ node?: { children?: unknown[] } }>> = ({
  node,
  children,
}) => {
  // 从 pre 的首个子节点（code）读取 className，判断语言与是否 mermaid
  const codeNode = node?.children?.[0] as { properties?: { className?: unknown } } | undefined;
  const cls = codeNode?.properties?.className;
  const classList = Array.isArray(cls) ? (cls.filter((item) => typeof item === 'string') as string[]) : [];
  const isMermaid = classList.some((item) => item.includes('language-mermaid'));
  const languageClass = classList.find((item) => /language-(\w+)/.exec(item));
  const language = languageClass ? /language-(\w+)/.exec(languageClass)?.[1] ?? '' : '';

  // mermaid 图表由 CodeBlock 内部渲染 Mermaid，这里不包裹容器与 pre
  if (isMermaid) {
    return <>{children}</>;
  }

  const [isCodeCopied, setIsCodeCopied] = useState(false);
  // 高亮后 children 为 React 元素，需递归提取纯文本再复制 / 下载
  const code = getNodeText(children).replace(/\n$/, '');

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
      <pre>{children}</pre>
    </div>
  );
};

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

  // 缓存回调引用，保证 message 未变化时 handleCitationJump 引用稳定，进而使 markdownComponents 能复用
  const handleCitationJump = useCallback(
    (citationId: number) => {
      if (!message.citations || message.citations.length === 0) {
        return;
      }

      onOpenCitations?.({ message, activeCitationId: citationId });
    },
    [message, onOpenCitations],
  );

  // 缓存 Markdown 组件映射，避免每次渲染重建 components 对象（尤其是 code 组件），减少 ReactMarkdown 重渲染开销
  const markdownComponents = useMemo<Components>(
    () => ({
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
      // 围栏代码块统一交给模块级 CodeBlockContainer 渲染（含语言栏 / 复制 / 下载与内层 pre/code）
      pre: ({ node, children }) => <CodeBlockContainer node={node} children={children} />,
      code: (props) => <CodeBlock {...props} isStreaming={isStreaming} />,
    }),
    [isStreaming, handleCitationJump],
  );

  // 已完成的消息（占绝大多数）内容不变时无需重复执行正则替换，使用 useMemo 缓存
  const contentWithCitationLinks = useMemo(() => {
    if (!message.citations?.length) {
      return message.content;
    }
    return message.content.replace(/\[来源(\d+)\]/g, (_match, citationIdText: string) => {
      const citationId = Number.parseInt(citationIdText, 10);
      const hasCitation = message.citations?.some((citation) => citation.id === citationId);
      return hasCitation ? `[来源${citationId}](#citation-${citationId})` : `[来源${citationId}]`;
    });
  }, [message.content, message.citations]);

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
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeHighlight, rehypeKatex]}
                components={markdownComponents}
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
                  onClick={() => onContinueGenerate?.(message.id)}
                  title="继续生成"
                >
                  <Play size={15} />
                  <span>继续生成</span>
                </button>
              )}
              {(isCompleted || isStopped) && (
                <button className={styles.actionBtn} onClick={() => onRegenerate?.(message.id)} title="重新生成">
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

// 使用 React.memo 包裹：流式聊天时父组件每次 chunk 都会重建 messages 数组，
// 未变化的消息引用应跳过重渲染，避免历史消息重复解析 Markdown 造成卡顿
export default React.memo(ChatMessage);
