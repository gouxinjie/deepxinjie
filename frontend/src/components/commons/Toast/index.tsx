/**
 * @component Toast
 * @description 全局轻提示组件，固定底部居中出现，默认 3 秒后自动消失。
 * 支持 info / success / error 三种类型，由父组件通过受控的 toast 状态渲染，
 * 自动关闭后通过 onClose 回调清空父级状态。供 ChatMain / ChatInput / ChatSidebar 等统一复用。
 * @author gouxinjie
 * @created 2025-07-30
 * @updated 2025-07-30
 */
import { useEffect, useRef } from 'react';
import { cn } from '../../../utils/cn';
import styles from './index.module.scss';

/** 提示类型 */
export type ToastType = 'info' | 'success' | 'error';

/** Toast 组件属性 */
export interface ToastProps {
  /** 提示文案 */
  message: string;
  /** 提示类型，默认 info */
  type?: ToastType;
  /** 关闭回调：组件内部计时结束后触发，用于清空父级 toast 状态 */
  onClose: () => void;
  /** 自动关闭时长（毫秒），默认 3000 */
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose, duration = 3000 }) => {
  // 用 ref 持有最新 onClose，避免因父组件重渲染导致计时器被反复重置
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [message, duration]);

  return (
    <div className={cn(styles.toast, styles[type])} role="alert">
      {message}
    </div>
  );
};

export default Toast;
