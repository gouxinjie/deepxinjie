import { useCallback, useRef } from 'react';

/**
 * @hook useEvent
 * @description 返回一个引用永远稳定的事件回调，内部始终调用“最近一次渲染”的 handler。
 *            用于解决将回调传入 React.memo 组件时，因普通函数/内联箭头引用每次渲染都变化，
 *            导致 memo 失效、父组件重渲染时子组件被迫重渲染的性能问题（例如滚动聊天区域时
 *            全部历史消息被重新解析 Markdown 造成卡顿）。
 *            实现说明：在渲染阶段同步更新 ref.current，因此回调始终能拿到最新闭包状态，
 *            同时返回的函数引用恒定，避免使用 eslint-disable 也能通过 exhaustive-deps 检查。
 */
export function useEvent<Args extends unknown[], R>(
  handler: (...args: Args) => R,
): (...args: Args) => R {
  // 保存最近一次渲染的 handler，回调调用时始终取最新闭包，保证状态一致性
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // 返回引用恒定的包装函数：依赖为空数组，引用永不变，从而让 React.memo 真正生效
  return useCallback((...args: Args) => handlerRef.current(...args), []);
}
