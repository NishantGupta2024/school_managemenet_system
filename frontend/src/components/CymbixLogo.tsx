import React from 'react';

export interface CymbixLogoProps {
  className?: string;
  alt?: string;
  onClick?: () => void;
  priority?: boolean;
}

/**
 * Standardized CYMBIX Brand Logo Component
 * Single Source of Truth (SSOT) matching the Home Page dimensions and visual rendering:
 * - Mobile:   h-12 (48px height, ~172px width)
 * - Tablet:   sm:h-16 (64px height, ~229px width)
 * - Desktop:  lg:h-[72px] (72px height, ~257px width)
 * - Aspect Ratio: 3.575:1 (Native 2049x573 retina asset)
 */
export const CymbixLogo: React.FC<CymbixLogoProps> = ({
  className = '',
  alt = 'CYMBIX — Simplicity • Efficiency • Connectivity',
  onClick,
}) => {
  return (
    <img
      src="/cymbix-logo.png"
      alt={alt}
      onClick={onClick}
      className={`h-12 sm:h-16 lg:h-[72px] w-auto object-contain shrink-0 ${className}`}
    />
  );
};

export default CymbixLogo;
