import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 className 工具函数。
 * 使用 clsx 处理条件类名，再通过 tailwind-merge 解决 Tailwind 类名冲突。
 * @param inputs - 任意数量的类名（字符串、数组、对象等 ClassValue 类型）
 * @returns 合并去重后的 className 字符串
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
