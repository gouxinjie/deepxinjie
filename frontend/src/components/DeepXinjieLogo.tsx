/**
 * @component DeepXinjieLogo
 * @description DeepXinjie 品牌 Logo 组件，使用几何化 SVG 呈现更稳定的产品识别符号
 * @author Codex
 * @created 2026-04-08
 * @updated 2026-04-08
 */
import React from 'react';

/**
 * DeepXinjieLogo 组件属性
 * @property size - Logo 显示尺寸，单位为像素，类型为 number，非必填，默认值为 24
 * @property style - Logo 行内样式对象，类型为 React.CSSProperties，非必填，默认值为 undefined
 */
interface DeepXinjieLogoProps {
  size?: number;
  style?: React.CSSProperties;
}

const DeepXinjieLogo: React.FC<DeepXinjieLogoProps> = ({ size = 24, style }) => {
  return (
    <svg
      width={size}
      height={size}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="DeepXinjie Logo"
    >
      <defs>
        <linearGradient id="deepxinjie-logo-gradient" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="55%" stopColor="var(--color-primary-hover)" />
          <stop offset="100%" stopColor="#163B8F" />
        </linearGradient>
        <linearGradient id="deepxinjie-logo-accent" x1="7" y1="6" x2="17" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.96)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.84)" />
        </linearGradient>
        <linearGradient id="deepxinjie-logo-glow" x1="6" y1="4" x2="18" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-primary-hover)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.12)" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="20" height="20" rx="6.5" fill="url(#deepxinjie-logo-gradient)" />
      <path
        d="M14 2H15.9C19.2699 2 22 4.73005 22 8.1V10.4L10.4 22H8.1C4.73005 22 2 19.2699 2 15.9V14L14 2Z"
        fill="url(#deepxinjie-logo-glow)"
      />
      <path
        d="M7.2 6.7H9.9L12.1 9.92L14.35 6.7H17.05L13.45 11.72L17.35 17.3H14.62L12.05 13.56L9.42 17.3H6.72L10.65 11.79L7.2 6.7Z"
        fill="url(#deepxinjie-logo-accent)"
      />
      <path
        d="M8.8 6.7H9.9L16.05 15.45L14.95 17.02L8.8 8.25V6.7Z"
        fill="rgba(255, 255, 255, 0.18)"
      />
      <path
        d="M15.95 5.8C16.75 5.8 17.4 6.45 17.4 7.25C17.4 8.05 16.75 8.7 15.95 8.7C15.15 8.7 14.5 8.05 14.5 7.25C14.5 6.45 15.15 5.8 15.95 5.8Z"
        fill="#9FD3FF"
      />
    </svg>
  );
};

export default DeepXinjieLogo;
