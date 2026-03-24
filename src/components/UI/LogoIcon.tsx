import React from 'react';

interface LogoIconProps {
  size?: number;
  className?: string;
}

export const LogoIcon: React.FC<LogoIconProps> = ({ size = 32, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="logo-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cfe83a" />
        <stop offset="45%" stopColor="#8a9a28" />
        <stop offset="100%" stopColor="#2e2e1a" />
      </linearGradient>
      <clipPath id="logo-clip">
        <rect width="100" height="100" />
      </clipPath>
    </defs>

    {/* Background */}
    <rect width="100" height="100" fill="url(#logo-grad)" />

    {/* Horizontal left stripes */}
    <rect x="0" y="8"  width="28" height="5" fill="white" opacity="0.9" />
    <rect x="0" y="18" width="22" height="5" fill="white" opacity="0.9" />
    <rect x="0" y="28" width="16" height="5" fill="white" opacity="0.9" />
    <rect x="0" y="38" width="10" height="5" fill="white" opacity="0.9" />
    <rect x="0" y="58" width="10" height="5" fill="white" opacity="0.9" />
    <rect x="0" y="68" width="16" height="5" fill="white" opacity="0.9" />
    <rect x="0" y="78" width="22" height="5" fill="white" opacity="0.9" />
    <rect x="0" y="88" width="28" height="5" fill="white" opacity="0.9" />

    {/* Horizontal right stripes */}
    <rect x="72" y="8"  width="28" height="5" fill="white" opacity="0.9" />
    <rect x="78" y="18" width="22" height="5" fill="white" opacity="0.9" />
    <rect x="84" y="28" width="16" height="5" fill="white" opacity="0.9" />
    <rect x="90" y="38" width="10" height="5" fill="white" opacity="0.9" />
    <rect x="90" y="58" width="10" height="5" fill="white" opacity="0.9" />
    <rect x="84" y="68" width="16" height="5" fill="white" opacity="0.9" />
    <rect x="78" y="78" width="22" height="5" fill="white" opacity="0.9" />
    <rect x="72" y="88" width="28" height="5" fill="white" opacity="0.9" />

    {/* Diagonal stripes — top-left to bottom-right (\) */}
    <line x1="5"  y1="0"  x2="100" y2="95" stroke="white" strokeWidth="5.5" opacity="0.9" />
    <line x1="18" y1="0"  x2="100" y2="82" stroke="white" strokeWidth="5.5" opacity="0.9" />
    <line x1="0"  y1="18" x2="82"  y2="100" stroke="white" strokeWidth="5.5" opacity="0.9" />
    <line x1="0"  y1="5"  x2="95"  y2="100" stroke="white" strokeWidth="5.5" opacity="0.9" />

    {/* Diagonal stripes — top-right to bottom-left (/) */}
    <line x1="95"  y1="0"  x2="0"  y2="95" stroke="white" strokeWidth="5.5" opacity="0.9" />
    <line x1="82"  y1="0"  x2="0"  y2="82" stroke="white" strokeWidth="5.5" opacity="0.9" />
    <line x1="100" y1="18" x2="18" y2="100" stroke="white" strokeWidth="5.5" opacity="0.9" />
    <line x1="100" y1="5"  x2="5"  y2="100" stroke="white" strokeWidth="5.5" opacity="0.9" />
  </svg>
);
