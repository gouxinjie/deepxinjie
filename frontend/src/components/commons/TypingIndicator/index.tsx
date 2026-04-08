/**
 * @component TypingIndicator
 * @description 正在输入指示器组件，负责展示 AI 回复前的加载动效
 * @author gouxinjie
 * @created 2026-03-20
 * @updated 2026-04-08
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
