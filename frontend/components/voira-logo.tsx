"use client";

import { cn } from "@/lib/utils";

/**
 * Voira brand identity.
 *
 * `VoiraMark` is the app icon: a gradient tile carrying a waveform glyph.
 * `VoiraWordmark` is the gradient-filled "Voira" logotype.
 * `VoiraLogo` composes both for headers and sidebars.
 */

export function VoiraMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[12px] shadow-[0_6px_16px_-6px_rgba(99,91,255,0.65)] ring-1 ring-black/5",
        className,
      )}
    >
      <svg viewBox="0 0 40 40" fill="none" className="size-full" aria-hidden="true">
        <defs>
          <linearGradient id="voira-mark-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#635BFF" />
            <stop offset="0.5" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#D946EF" />
          </linearGradient>
          <linearGradient id="voira-mark-sheen" x1="20" y1="0" x2="20" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" stopOpacity="0.32" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#voira-mark-bg)" />
        <rect width="40" height="40" rx="12" fill="url(#voira-mark-sheen)" />
        <rect
          x="0.5"
          y="0.5"
          width="39"
          height="39"
          rx="11.5"
          stroke="#FFFFFF"
          strokeOpacity="0.28"
        />
        {/* waveform */}
        <g fill="#FFFFFF">
          <rect x="7.5" y="16" width="3" height="8" rx="1.5" fillOpacity="0.85" />
          <rect x="13" y="12" width="3" height="16" rx="1.5" fillOpacity="0.95" />
          <rect x="18.5" y="8" width="3" height="24" rx="1.5" />
          <rect x="24" y="13" width="3" height="14" rx="1.5" fillOpacity="0.95" />
          <rect x="29.5" y="17" width="3" height="6" rx="1.5" fillOpacity="0.85" />
        </g>
        {/* sparkle */}
        <path
          d="M31.5 4.5 32.6 7.4 35.5 8.5 32.6 9.6 31.5 12.5 30.4 9.6 27.5 8.5 30.4 7.4Z"
          fill="#FFFFFF"
          fillOpacity="0.9"
        />
      </svg>
    </span>
  );
}

export function VoiraWordmark({
  className,
  gradientClassName = "bg-gradient-to-r from-[#635BFF] via-[#8B5CF6] to-[#D946EF]",
}: {
  className?: string;
  gradientClassName?: string;
}) {
  return (
    <span
      className={cn(
        "bg-clip-text text-transparent",
        gradientClassName,
        className,
      )}
    >
      Voira
    </span>
  );
}

export function VoiraLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <VoiraMark className="size-9" />
      <VoiraWordmark className="text-[17px] font-semibold tracking-tight" />
    </span>
  );
}
