import React from 'react';

interface IconButtonProps {
  onClick: (e: React.MouseEvent) => void;
  title?: string;
  disabled?: boolean;
  pulsing?: boolean;
  /** Anchor for the first-run tutorial (see Tour.tsx). */
  tourId?: string;
  children: React.ReactNode;
}

// Shared style for the header's row of icon-only toggle buttons — keeps
// hover/disabled/pulse states consistent instead of copy-pasting the
// className string per button.
export const IconButton: React.FC<IconButtonProps> = ({ onClick, title, disabled, pulsing, tourId, children }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    data-tour={tourId}
    type="button"
    className={`transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
      disabled
        ? 'text-white/20 cursor-default'
        : pulsing
        ? 'text-white animate-pulse active:scale-95'
        : 'text-white/30 hover:text-white active:scale-95'
    }`}
  >
    {children}
  </button>
);
