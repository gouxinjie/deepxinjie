/**
 * @component TypingIndicator 正在输入指示器组件
 * @description 展示 AI 正在思考或准备回答时的三点加载动画。
 * @author gouxinjie
 * @created 2026-03-20
 */
import React from 'react';
import styles from './index.module.scss';

const TypingIndicator: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.dot} />
      <div className={styles.dot} />
      <div className={styles.dot} />
    </div>
  );
};

export default TypingIndicator;
