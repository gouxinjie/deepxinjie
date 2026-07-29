/**
 * @component DeepXinjieLogo
 * @description DeepXinjie 品牌 Logo 组件，斜切渐变卡片搭配对话气泡与 X 符号，兼顾 AI 会话语义与品牌辨识度
 * @author gouxinjie
 * @created 2026-04-08
 * @updated 2026-07-29
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
        <linearGradient id="dx-logo-bg" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="60%" stopColor="var(--color-primary-hover)" />
          <stop offset="100%" stopColor="var(--color-primary-active)" />
        </linearGradient>
        <linearGradient id="dx-logo-x" x1="8" y1="9" x2="13" y2="13" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-primary-active)" />
        </linearGradient>
      </defs>

      {/* 斜切圆角卡片，右上切角增强品牌科技感与辨识度 */}
      <path
        d="M4.5 2 H16 L22 8 V19.5 A2.5 2.5 0 0 1 19.5 22 H4.5 A2.5 2.5 0 0 1 2 19.5 V4.5 A2.5 2.5 0 0 1 4.5 2 Z"
        fill="url(#dx-logo-bg)"
      />
      {/* 左上角柔光，提升质感 */}
      <rect x="3" y="3" width="8" height="8" rx="3.5" fill="#FFFFFF" fillOpacity="0.12" />
      {/* 对话气泡，白色半透明，传达智能会话 */}
      <path
        d="M8 7 H14 C15 7 15.8 7.8 15.8 8.8 V12.5 C15.8 13.5 15 14.3 14 14.3 H11.4 L9 16.5 V14.3 H8 C7 14.3 6.2 13.5 6.2 12.5 V8.8 C6.2 7.8 7 7 8 7 Z"
        fill="#FFFFFF"
        fillOpacity="0.96"
      />
      {/* 气泡内 X 形符号，呼应品牌名 Xinjie，强化识别 */}
      <path
        d="M9.5 9.8 L11.5 11.8 M11.5 9.8 L9.5 11.8"
        stroke="url(#dx-logo-x)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* 斜切处灵动光点，点缀 AI 智能感 */}
      <circle cx="19" cy="4.6" r="1.2" fill="#FFFFFF" fillOpacity="0.9" />
    </svg>
  );
};

export default DeepXinjieLogo;
