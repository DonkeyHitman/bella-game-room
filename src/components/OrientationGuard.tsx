'use client';

import React, { useState, useEffect } from 'react';

export default function OrientationGuard() {
  const [isPortrait, setIsPortrait] = useState<boolean>(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Check if vertical height exceeds width (standard mobile portrait)
      const isVertical = window.innerHeight > window.innerWidth && window.innerWidth < 900;
      setIsPortrait(isVertical);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#1a1d24] flex flex-col items-center justify-center p-6 text-center select-none">
      {/* Animated Phone Rotation Icon */}
      <div className="relative w-16 h-28 border-4 border-[#f59e0b] rounded-2xl flex items-center justify-center mb-6 animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.3)]">
        <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] absolute bottom-2" />
        <span className="text-2xl animate-spin" style={{ animationDuration: '3s' }}>
          🔄
        </span>
      </div>

      <h2 className="text-base font-serif font-black tracking-widest text-[#f59e0b] uppercase">
        Landscape Orientation Required
      </h2>
      <p className="text-xs text-slate-300 font-semibold tracking-wider uppercase mt-2 max-w-xs">
        Please rotate your device horizontally to enter the B.E.L.L.A. Game Room.
      </p>

      <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest mt-6">
        Auto-Resumes When Rotated
      </span>
    </div>
  );
}
