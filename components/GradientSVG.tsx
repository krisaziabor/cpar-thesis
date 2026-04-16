"use client";

import { useId } from "react";

/* ── Hash utilities (from fallback-avatar) ──────────────────────────────── */

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

function getUnit(number: number, range: number, index?: number): number {
  const value = number % range;
  if (index && Math.floor(number / Math.pow(10, index)) % 2 === 0)
    return -value;
  return value;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function GradientSVG({
  colors,
  seed,
  size,
  round = false,
  blurDeviation = 7,
}: {
  colors: [string, string, string];
  seed: string;
  size: number;
  round?: boolean;
  blurDeviation?: number;
}) {
  const maskId = useId();
  const filterId = useId();
  const num = hash(seed || "kanon");

  const layers = colors.map((color, i) => ({
    color,
    translateX: getUnit(num * (i + 1), size / 10, 1),
    translateY: getUnit(num * (i + 1), size / 10, 2),
    scale: 1.2 + getUnit(num * (i + 1), size / 20) / 10,
    rotate: getUnit(num * (i + 1), 360, 1),
  }));

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      width={round ? size : "100%"}
      height={round ? size : "100%"}
      preserveAspectRatio={round ? undefined : "xMidYMid slice"}
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={size}
        height={size}
      >
        <rect
          width={size}
          height={size}
          rx={round ? size * 2 : 0}
          fill="#FFFFFF"
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <rect width={size} height={size} fill={layers[0].color} />
        <path
          filter={`url(#${filterId})`}
          d="M32.414 59.35L50.376 70.5H72.5v-71H33.728L26.5 13.381l19.057 27.08L32.414 59.35z"
          fill={layers[1].color}
          transform={`translate(${layers[1].translateX} ${layers[1].translateY}) rotate(${layers[1].rotate} ${size / 2} ${size / 2}) scale(${layers[1].scale})`}
        />
        <path
          filter={`url(#${filterId})`}
          style={{ mixBlendMode: "overlay" }}
          d="M22.216 24L0 46.75l14.108 38.129L78 86l-3.081-59.276-22.378 4.005 12.972 20.186-23.35 27.395L22.215 24z"
          fill={layers[2].color}
          transform={`translate(${layers[2].translateX} ${layers[2].translateY}) rotate(${layers[2].rotate} ${size / 2} ${size / 2}) scale(${layers[2].scale})`}
        />
      </g>
      <defs>
        <filter
          id={filterId}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            stdDeviation={blurDeviation}
            result="effect1_foregroundBlur"
          />
        </filter>
      </defs>
    </svg>
  );
}
