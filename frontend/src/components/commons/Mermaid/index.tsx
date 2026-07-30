/**
 * @component Mermaid
 * @description 将 mermaid 图表源码渲染为 SVG 流程图 / 时序图 / 类图等
 * @author AI
 * @created 2026-07-29
 * @updated 2026-07-30
 */
import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import styles from './index.module.scss';

/**
 * Mermaid 组件属性
 */
interface MermaidProps {
  /** mermaid 图表源码字符串（```mermaid 代码块中的内容） */
  chart: string;
  /** 是否处于流式输出中（流式时不展示渲染错误，避免中间态误报） */
  isStreaming?: boolean;
}

// 当前已初始化的主题，避免重复初始化
let currentTheme: 'dark' | 'default' | null = null;

/**
 * 清理 mermaid 源码：去除可能误带入的反引号围栏与首尾空白
 * @param source - 原始图表源码
 * @returns 清理后的源码
 */
const cleanMermaidSource = (source: string): string =>
  source
    .replace(/^```(?:mermaid)?\s*\n?/i, '')
    .replace(/```\s*$/, '')
    .trim();

// 标签内会导致 mermaid 语法错误的特殊字符
const LABEL_SPECIAL_RE = /[[\](){}<>|/\\]/;

/**
 * 若标签包含特殊字符且未被引号包裹，则用双引号包裹标签
 * @param id - 节点 ID
 * @param open - 标签左定界符
 * @param label - 标签内容
 * @param close - 标签右定界符
 * @returns 重组后的节点片段
 */
const wrapLabel = (id: string, open: string, label: string, close: string): string => {
  if (/^".*"$/.test(label) || !LABEL_SPECIAL_RE.test(label)) {
    return `${id}${open}${label}${close}`;
  }
  return `${id}${open}"${label}"${close}`;
};

// 常见节点形状（定界符对），顺序很重要：多字符定界符优先于单字符
const NODE_SHAPES: Array<[string, string]> = [
  ['[[', ']]'],
  ['((', '))'],
  ['([', '])'],
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
];

// 预编译各节点形状的匹配正则，避免每次渲染重复构造（性能优化）
const NODE_SHAPE_PATTERNS: Array<{ open: string; close: string; pattern: RegExp }> = NODE_SHAPES.map(
  ([open, close]) => {
    const escapedOpen = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      open,
      close,
      pattern: new RegExp(`(^|\\s)([\\w]+)(${escapedOpen})(.+)(${escapedClose})(?=\\s|$)`),
    };
  },
);

/**
 * 容错处理：将包含特殊字符（如 arr[right]、<br/>）的节点 / 边标签
 * 用双引号包裹，避免 mermaid 将标签内的 [ ] ( ) 误判为定界符而解析失败
 * @param source - 原始图表源码
 * @returns 处理后的源码
 */
const sanitizeMermaidSource = (source: string): string =>
  source
    .split('\n')
    .map((line) => {
      // 跳过注释与 subgraph 声明（其标题不是普通节点标签）
      if (/^\s*%%/.test(line) || /^\s*subgraph\b/i.test(line)) {
        return line;
      }
      return line
        .split(/(\s*(?:-\.->|-->|---|==>|->>|-\s*->)\s*)/)
        .map((token) => {
          for (const { open, close, pattern } of NODE_SHAPE_PATTERNS) {
            const matched = token.match(pattern);
            if (matched) {
              return wrapLabel(matched[2], open, matched[4], close);
            }
          }
          // 边标签 |label|：标签含特殊字符且未加引号时用双引号包裹
          return token.replace(/\|([^|]+)\|/g, (whole, label: string) => {
            if (LABEL_SPECIAL_RE.test(label) && !/^".*"$/.test(label)) {
              return `|"${label}"|`;
            }
            return whole;
          });
        })
        .join('');
    })
    .join('\n');

/**
 * 根据当前主题初始化 mermaid 配置
 * @param theme - 当前主题，dark 表示深色模式
 */
const setupMermaid = (theme: 'dark' | 'default'): void => {
  if (currentTheme === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    // antiscript：允许标签内 HTML（如 <br/>、<b>），同时过滤脚本，兼顾兼容性与安全
    securityLevel: 'antiscript',
    fontFamily: 'inherit',
  });
  currentTheme = theme;
};

const Mermaid: React.FC<MermaidProps> = ({ chart, isStreaming = false }) => {
  // 图表容器 DOM 引用
  const containerRef = useRef<HTMLDivElement>(null);
  // 错误信息（渲染失败时展示 mermaid 返回的真实报错）
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    /**
     * 调用 mermaid 渲染当前源码
     */
    const renderChart = async (): Promise<void> => {
      const source = sanitizeMermaidSource(cleanMermaidSource(chart));
      if (!source) {
        return;
      }
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      setupMermaid(isDark ? 'dark' : 'default');
      // 使用随机 id 避免多次渲染冲突
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
      try {
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        // 记录真实错误便于排查（遵循错误必须记录日志的规范）
        console.error('[Mermaid] 图表渲染失败：', err);
        // 流式输出中不展示错误，避免中间态片段误报
        if (!cancelled && !isStreaming) {
          setError(err instanceof Error ? err.message : '图表渲染失败');
        }
      }
    };

    void renderChart();

    // 监听主题切换，切换后重新渲染以匹配新主题
    const observer = new MutationObserver(() => {
      if (!cancelled && containerRef.current) {
        void renderChart();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chart, isStreaming]);

  // 仅在非流式且确实出错时展示错误面板，并附带 mermaid 真实报错信息
  if (error && !isStreaming) {
    return (
      <div className={styles.mermaidError} role="alert">
        <div className={styles.errorTitle}>图表渲染失败</div>
        <pre className={styles.errorCode}>{error}</pre>
        <pre className={styles.errorCode}>
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} className={styles.mermaidContainer} />;
};

export default Mermaid;
