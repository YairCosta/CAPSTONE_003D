import React from 'react';

/**
 * Logotipo de Revela: una lupa que revela a una persona.
 * `currentColor` toma el color del texto que lo rodea, así sirve en fondo claro y oscuro.
 */
export const RevelaLogo: React.FC<{ className?: string; title?: string }> = ({
  className = 'h-6 w-6',
  title = 'Revela',
}) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role="img"
    aria-label={title}
  >
    <title>{title}</title>
    {/* Lente de la lupa */}
    <circle cx="14" cy="14" r="9.5" />
    {/* Mango */}
    <path d="M21 21l6.5 6.5" />
    {/* Persona revelada dentro del lente: cabeza y hombros */}
    <circle cx="14" cy="11.4" r="3" />
    <path d="M8.9 19.4a5.6 5.6 0 0 1 10.2 0" />
  </svg>
);
