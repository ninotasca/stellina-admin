import React from 'react';

interface Props {
  /** Small = topbar mark (star + 2-line text). Compact = just the gold star. */
  variant?: 'small' | 'compact';
  className?: string;
}

const GoldStar: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="stellina-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f7d27a" />
        <stop offset="45%" stopColor="#e2b450" />
        <stop offset="100%" stopColor="#9a6b1a" />
      </linearGradient>
    </defs>
    {/* Five-pointed star */}
    <path
      d="M16 2.4 L19.6 11.6 L29.4 12.4 L21.9 18.7 L24.4 28.2 L16 23 L7.6 28.2 L10.1 18.7 L2.6 12.4 L12.4 11.6 Z"
      fill="url(#stellina-gold)"
      stroke="#7a5215"
      strokeWidth="0.4"
      strokeLinejoin="round"
    />
  </svg>
);

const BrandMark: React.FC<Props> = ({ variant = 'small', className = '' }) => {
  if (variant === 'compact') {
    return <GoldStar className={`w-7 h-7 ${className}`} />;
  }
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <GoldStar className="w-8 h-8 shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="text-[15px] font-semibold tracking-wide text-gray-900">
          Stellina Connections
        </span>
        <span className="text-[10px] text-gray-500 tracking-[0.18em] uppercase">
          Admin Console
        </span>
      </div>
    </div>
  );
};

export default BrandMark;
