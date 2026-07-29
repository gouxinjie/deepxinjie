/**
 * @component ChatSearchDialog
 * @description 全局搜索浮层组件，支持搜索会话标题和消息内容
 * @author
 * @created 2026-07-29
 * @updated 2026-07-29
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

import { searchApi } from '../../services/api';
import { extractApiErrorMessage } from '../../services/api';
import type { SearchResultItem } from '../../types/api';
import styles from './ChatSearchDialog.module.scss';

interface ChatSearchDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 打开/关闭回调 */
  onOpenChange: (open: boolean) => void;
  /** 关闭侧边栏回调（移动端） */
  onCloseSidebar: () => void;
}

/** 防抖延迟（毫秒） */
const DEBOUNCE_MS = 300;

/**
 * 格式化 ISO 时间字符串为可读模式。
 * @param isoStr - ISO 时间字符串
 * @returns 格式化后的时间文本
 */
const formatTime = (isoStr: string): string => {
  if (!isoStr) {
    return '';
  }

  try {
    const date = new Date(isoStr);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    if (diffDays === 1) {
      return '昨天';
    }

    if (diffDays < 7) {
      return `${diffDays}天前`;
    }

    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  } catch {
    return '';
  }
};

const ChatSearchDialog: React.FC<ChatSearchDialogProps> = ({ open, onOpenChange, onCloseSidebar }) => {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const navigate = useNavigate();

  /**
   * 执行搜索请求。
   * @param kw - 搜索关键词
   */
  const doSearch = useCallback(async (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) {
      setResults([]);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await searchApi.conversation(trimmed);
      if (response.data.success) {
        setResults(response.data.data.results);
        setSelectedIndex(-1);
      } else {
        setError(response.data.message);
        setResults([]);
      }
    } catch (err) {
      setError(extractApiErrorMessage(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 输入变化时防抖搜索。
   */
  const handleInputChange = (value: string) => {
    setKeyword(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      void doSearch(value);
    }, DEBOUNCE_MS);
  };

  /**
   * 清除输入框内容。
   */
  const handleClear = () => {
    setKeyword('');
    setResults([]);
    setError('');
    setSelectedIndex(-1);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    inputRef.current?.focus();
  };

  /**
   * 跳转到搜索结果。
   * @param result - 选中的搜索结果项
   */
  const handleSelect = (result: SearchResultItem) => {
    onOpenChange(false);
    if (result.messageId !== null) {
      navigate(`/chat/${result.sessionId}`, {
        state: { highlightMessageId: result.messageId },
      });
    } else {
      navigate(`/chat/${result.sessionId}`);
    }
    onCloseSidebar();
  };

  /**
   * 键盘导航：上下箭头选择、回车跳转、ESC关闭。
   */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) => {
        const next = prev < results.length - 1 ? prev + 1 : 0;
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : results.length - 1;
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (event.key === 'Enter' && selectedIndex >= 0 && selectedIndex < results.length) {
      event.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  useEffect(() => {
    if (open) {
      // 打开时重置状态并聚焦输入框
      setKeyword('');
      setResults([]);
      setError('');
      setSelectedIndex(-1);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  /**
   * 渲染搜索结果列表。
   * @returns 结果节点或空状态
   */
  const renderResults = () => {
    if (loading) {
      return (
        <div className={styles.centerStatus}>
          <Loader2 size={24} className={styles.spinner} />
          <span>搜索中...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.centerStatus}>
          <span className={styles.errorText}>{error}</span>
        </div>
      );
    }

    if (keyword.trim() && results.length === 0) {
      return (
        <div className={styles.centerStatus}>
          <span>未找到相关结果</span>
        </div>
      );
    }

    if (results.length === 0) {
      return (
        <div className={styles.centerStatus}>
          <span>输入关键词搜索对话内容</span>
        </div>
      );
    }

    return (
      <div className={styles.resultList}>
        {results.map((result, index) => (
            <div
              key={`${result.sessionId}-${result.messageId ?? 'title'}`}
              className={`${styles.resultItem} ${selectedIndex === index ? styles.selected : ''}`}
              ref={(el) => { itemRefs.current[index] = el; }}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className={styles.resultHeader}>
                <span className={styles.resultSessionTitle}>{result.sessionTitle}</span>
                {result.matchedAt && (
                  <span className={styles.resultTime}>{formatTime(result.matchedAt)}</span>
                )}
              </div>
              {result.messageId !== null ? (
                <div className={styles.resultPreview}>
                  {result.role === 'user' ? '问：' : '答：'}{result.preview}
                </div>
              ) : (
                <div className={styles.resultPreview}>
                  <span className={styles.matchBadge}>匹配会话标题</span>
                </div>
              )}
            </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} onKeyDown={handleKeyDown} aria-describedby={undefined}>
          <Dialog.Title className={styles.visuallyHidden}>搜索对话内容</Dialog.Title>

          <div className={styles.inputWrapper}>
            <Search size={18} className={styles.inputIcon} />
            <input
              ref={inputRef}
              className={styles.input}
              placeholder="搜索对话内容..."
              value={keyword}
              onChange={(event) => handleInputChange(event.target.value)}
            />
            {keyword && (
              <button className={styles.clearBtn} onClick={handleClear} title="清除">
                <X size={16} />
              </button>
            )}
          </div>

          <div className={styles.resultContainer}>
            {renderResults()}
          </div>

          <Dialog.Close asChild>
            <button className={styles.closeBtn} title="关闭搜索">
              <X size={20} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ChatSearchDialog;
