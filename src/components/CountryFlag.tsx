import React from 'react';
import type { CountryCode } from '../data/countries';

// Banderas en SVG: Windows no dibuja los emojis de bandera (se ven como "CL", "PE").
// Un país sin dibujo cae en una etiqueta con su código.

const FLAGS: Partial<Record<CountryCode, React.ReactNode>> = {
  CL: (
    <>
      <rect width="30" height="10" fill="#FFFFFF" />
      <rect y="10" width="30" height="10" fill="#D52B1E" />
      <rect width="10" height="10" fill="#0039A6" />
      <polygon
        points="5,2.2 5.72,4.1 7.7,4.1 6.1,5.3 6.7,7.2 5,6.05 3.3,7.2 3.9,5.3 2.3,4.1 4.28,4.1"
        fill="#FFFFFF"
      />
    </>
  ),
  PE: (
    <>
      <rect width="10" height="20" fill="#D91023" />
      <rect x="10" width="10" height="20" fill="#FFFFFF" />
      <rect x="20" width="10" height="20" fill="#D91023" />
    </>
  ),
};

interface CountryFlagProps {
  code: CountryCode;
  className?: string;
  title?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ code, className = 'h-3.5 w-5', title }) => {
  const flag = FLAGS[code];
  if (!flag) {
    return (
      <span className="inline-flex items-center rounded bg-slate-700 px-1 text-[10px] font-bold text-slate-100" title={title}>
        {code}
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 30 20"
      className={`inline-block shrink-0 rounded-[2px] ring-1 ring-slate-600/60 ${className}`}
      role="img"
      aria-label={title ?? code}
    >
      {title && <title>{title}</title>}
      {flag}
    </svg>
  );
};
