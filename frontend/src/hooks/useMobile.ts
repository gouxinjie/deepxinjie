import { useState, useEffect } from 'react';

/**
 * 自定义 Hook：用于监听窗口大小并判断是否为移动端 (<= 750px)
 * @returns boolean 是否为移动端
 */
export const useMobile = (breakpoint: number = 750): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth <= breakpoint);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= breakpoint);
    };

    window.addEventListener('resize', handleResize);
    // 立即执行一次以确保初始状态准确
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [breakpoint]);

  return isMobile;
};

export default useMobile;
