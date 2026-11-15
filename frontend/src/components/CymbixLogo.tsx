import React from 'react';

export interface CymbixLogoProps {
  className?: string;
  alt?: string;
  onClick?: () => void;
  priority?: boolean;
  variant?: 'light' | 'dark';
}

/**
 * Standardized CYMBIX Brand Logo Component
 * Single Source of Truth (SSOT) matching the Home Page dimensions and visual rendering:
 * - Mobile:   h-10 to h-12
 * - Tablet:   sm:h-12 to sm:h-16
 * - Desktop:  lg:h-[72px]
 */
export const CymbixLogo: React.FC<CymbixLogoProps> = ({
  className = '',
  alt = 'CYMBIX — Simplicity • Efficiency • Connectivity',
  onClick,
  variant = 'light',
}) => {
  const logoSrc = variant === 'dark' ? '/cymbix-logo-dark.png' : '/cymbix-logo.png';
  const defaultHeightClass = className.includes('h-') ? '' : 'h-12 sm:h-16 lg:h-[72px]';
  return (
    <img
      src={logoSrc}
      alt={alt}
      onClick={onClick}
      className={`${defaultHeightClass} w-auto object-contain shrink-0 ${className}`.trim()}
    />
  );
};

export default CymbixLogo;
