/**
 * @component Mermaid
 * @description 将 mermaid 图表源码渲染为 SVG 流程图 / 时序图 / 类图等
 * @author AI
 * @created 2026-07-29
 * @updated 2026-07-29
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
}

// 当前已初始化的主题，避免重复初始化
let currentTheme: 'dark' | 'default' | null = null;

/**
 * 根据当前主题初始化 mermaid 配置
 * @param theme - 当前主题，dark 表示深色模式
 */
const setupMermaid = (theme: 'dark' | 'default'): void => {
  if (currentTheme === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'strict',
    fontFamily: 'inherit',
  });
  currentTheme = theme;
};

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  // 图表容器 DOM 引用
  const containerRef = useRef<HTMLDivElement>(null);
  // 错误信息（渲染失败时展示原始源码）
  const [error, setError] = useState<string | null>(null);
  // 保存最新源码，供主题切换时重新渲染使用
  const chartRef = useRef<string>(chart);
  chartRef.current = chart;

  useEffect(() => {
    let cancelled = false;

    /**
     * 调用 mermaid 渲染当前源码
     */
    const renderChart = async (): Promise<void> => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      setupMermaid(isDark ? 'dark' : 'default');
      // 使用随机 id 避免多次渲染冲突
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
      try {
        const { svg } = await mermaid.render(id, chartRef.current);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
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
  }, [chart]);

  if (error) {
    return (
      <div className={styles.mermaidError} role="alert">
        <div className={styles.errorTitle}>图表渲染失败</div>
        <pre className={styles.errorCode}>
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} className={styles.mermaidContainer} />;
};

export default Mermaid;
