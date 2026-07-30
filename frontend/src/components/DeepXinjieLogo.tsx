/**
 * @component DeepXinjieLogo
 * @description DeepXinjie 品牌 Logo 组件。
 *              设计理念「灵感火花」：圆角渐变方块底 + 主四角星火花与一颗小星点缀，
 *              以 ✨ 火花意象表达「新解」的灵感与 AI 智能创见；
 *              纯几何符号、不含任何字母、无对话气泡，造型简洁，
 *              在 24px 小尺寸下依然清晰可辨，且随主题变量自适应配色。
 * @author gouxinjie
 * @created 2026-04-08
 * @updated 2026-07-30
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
        {/* 品牌渐变底，随主题变量（绿/蓝）自适应 */}
        <linearGradient id="dx-logo-bg" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="60%" stopColor="var(--color-primary-hover)" />
          <stop offset="100%" stopColor="var(--color-primary-active)" />
        </linearGradient>
        {/* 火花高光，强化「灵感」质感 */}
        <radialGradient id="dx-logo-spark" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.86" />
        </radialGradient>
      </defs>

      {/* 圆角方块底，应用渐变，构成标准 App 图标轮廓，提升辨识度 */}
      <rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill="url(#dx-logo-bg)" />
      {/* 内描边微光，增强边缘质感与层次 */}
      <rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="0.8" />
      {/* 左上角柔光，模拟光源，提升立体感 */}
      <rect x="3.4" y="3.4" width="7" height="7" rx="3" fill="#FFFFFF" fillOpacity="0.1" />

      {/* 主四角星火花柔光，营造灵感呼吸感 */}
      <circle cx="11" cy="12" r="6.5" fill="#FFFFFF" fillOpacity="0.14" />
      {/* 主四角星火花，象征「新解」核心灵感 */}
      <path
        d="M11 6.5 C11.45 9.3 13.7 11.55 16.5 12 C13.7 12.45 11.45 14.7 11 17.5 C10.55 14.7 8.3 12.45 5.5 12 C8.3 11.55 10.55 9.3 11 6.5 Z"
        fill="url(#dx-logo-spark)"
      />
      {/* 右上角小星点缀，强化「灵感迸发」的灵动意象 */}
      <path
        d="M17.5 4.8 C17.7 6.1 18.9 7.3 20.2 7.5 C18.9 7.7 17.7 8.9 17.5 10.2 C17.3 8.9 16.1 7.7 14.8 7.5 C16.1 7.3 17.3 6.1 17.5 4.8 Z"
        fill="#FFFFFF"
        fillOpacity="0.92"
      />
    </svg>
  );
};

export default DeepXinjieLogo;
