import React from 'react';
import type { CountryCode } from '../data/countries';

// Banderas en SVG: Windows no dibuja los emojis de bandera (se ven como "CL", "PE").
// Un país sin dibujo cae en una etiqueta con su código.

const FLAGS: Record<CountryCode, React.ReactNode> = {
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
  // Resto de América Latina: versiones simplificadas (colores y franjas; los escudos, como un disco)
  AR: (
    <>
      <rect width="30" height="20" fill="#74ACDF" />
      <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
      <circle cx="15" cy="10" r="2" fill="#F6B40E" />
    </>
  ),
  BO: (
    <>
      <rect width="30" height="6.67" fill="#D52B1E" />
      <rect y="6.67" width="30" height="6.67" fill="#F9E300" />
      <rect y="13.33" width="30" height="6.67" fill="#007934" />
    </>
  ),
  BR: (
    <>
      <rect width="30" height="20" fill="#009C3B" />
      <polygon points="15,2.5 27,10 15,17.5 3,10" fill="#FFDF00" />
      <circle cx="15" cy="10" r="4.2" fill="#002776" />
    </>
  ),
  CO: (
    <>
      <rect width="30" height="10" fill="#FCD116" />
      <rect y="10" width="30" height="5" fill="#003893" />
      <rect y="15" width="30" height="5" fill="#CE1126" />
    </>
  ),
  CR: (
    <>
      <rect width="30" height="20" fill="#002B7F" />
      <rect y="3.33" width="30" height="13.34" fill="#FFFFFF" />
      <rect y="6.67" width="30" height="6.66" fill="#CE1126" />
    </>
  ),
  CU: (
    <>
      <rect width="30" height="20" fill="#002A8F" />
      <rect y="4" width="30" height="4" fill="#FFFFFF" />
      <rect y="12" width="30" height="4" fill="#FFFFFF" />
      <polygon points="0,0 13,10 0,20" fill="#CF142B" />
      <polygon points="4.3,7.6 4.9,9.3 6.7,9.3 5.2,10.4 5.8,12.1 4.3,11.1 2.8,12.1 3.4,10.4 1.9,9.3 3.7,9.3" fill="#FFFFFF" />
    </>
  ),
  DO: (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <rect width="13" height="8" fill="#002D62" />
      <rect x="17" width="13" height="8" fill="#CE1126" />
      <rect y="12" width="13" height="8" fill="#CE1126" />
      <rect x="17" y="12" width="13" height="8" fill="#002D62" />
    </>
  ),
  EC: (
    <>
      <rect width="30" height="10" fill="#FFDD00" />
      <rect y="10" width="30" height="5" fill="#034EA2" />
      <rect y="15" width="30" height="5" fill="#ED1C24" />
      <circle cx="15" cy="10" r="2.4" fill="#7A5230" />
    </>
  ),
  SV: (
    <>
      <rect width="30" height="20" fill="#0F47AF" />
      <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
      <circle cx="15" cy="10" r="2" fill="#FFCC00" />
    </>
  ),
  GT: (
    <>
      <rect width="30" height="20" fill="#4997D0" />
      <rect x="10" width="10" height="20" fill="#FFFFFF" />
      <circle cx="15" cy="10" r="2.2" fill="#6CA64B" />
    </>
  ),
  HN: (
    <>
      <rect width="30" height="20" fill="#0073CF" />
      <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
      <circle cx="15" cy="10" r="0.9" fill="#0073CF" />
      <circle cx="11" cy="8.4" r="0.9" fill="#0073CF" />
      <circle cx="19" cy="8.4" r="0.9" fill="#0073CF" />
      <circle cx="11" cy="11.6" r="0.9" fill="#0073CF" />
      <circle cx="19" cy="11.6" r="0.9" fill="#0073CF" />
    </>
  ),
  MX: (
    <>
      <rect width="10" height="20" fill="#006847" />
      <rect x="10" width="10" height="20" fill="#FFFFFF" />
      <rect x="20" width="10" height="20" fill="#CE1126" />
      <circle cx="15" cy="10" r="2.4" fill="#8C6A2F" />
    </>
  ),
  NI: (
    <>
      <rect width="30" height="20" fill="#0067C6" />
      <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
      <polygon points="15,7.6 17.2,11.6 12.8,11.6" fill="#0067C6" />
    </>
  ),
  PA: (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <rect x="15" width="15" height="10" fill="#D21034" />
      <rect y="10" width="15" height="10" fill="#005293" />
      <polygon points="7.5,2.6 8.1,4.3 9.9,4.3 8.4,5.4 9,7.1 7.5,6.1 6,7.1 6.6,5.4 5.1,4.3 6.9,4.3" fill="#005293" />
      <polygon points="22.5,12.6 23.1,14.3 24.9,14.3 23.4,15.4 24,17.1 22.5,16.1 21,17.1 21.6,15.4 20.1,14.3 21.9,14.3" fill="#D21034" />
    </>
  ),
  PY: (
    <>
      <rect width="30" height="6.67" fill="#D52B1E" />
      <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
      <rect y="13.33" width="30" height="6.67" fill="#0038A8" />
      <circle cx="15" cy="10" r="2" fill="none" stroke="#0038A8" strokeWidth="0.8" />
    </>
  ),
  UY: (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <rect y="2.22" width="30" height="2.22" fill="#0038A8" />
      <rect y="6.67" width="30" height="2.22" fill="#0038A8" />
      <rect y="11.11" width="30" height="2.22" fill="#0038A8" />
      <rect y="15.56" width="30" height="2.22" fill="#0038A8" />
      <rect width="11" height="11.11" fill="#FFFFFF" />
      <circle cx="5.5" cy="5.5" r="2.6" fill="#FCD116" />
    </>
  ),
  VE: (
    <>
      <rect width="30" height="6.67" fill="#FFCC00" />
      <rect y="6.67" width="30" height="6.67" fill="#00247D" />
      <rect y="13.33" width="30" height="6.67" fill="#CF142B" />
      {[9, 11, 13, 15, 17, 19, 21].map((x, i) => (
        <circle key={x} cx={x} cy={9.2 + Math.abs(i - 3) * 0.55} r="0.55" fill="#FFFFFF" />
      ))}
    </>
  ),
};

interface CountryFlagProps {
  code: CountryCode;
  className?: string;
  title?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ code, className = 'h-3.5 w-5', title }) => {
  const flag = FLAGS[code] as React.ReactNode | undefined;
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
