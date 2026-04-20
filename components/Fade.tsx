"use client";

import * as React from "react";
import styles from "./fade.module.css";

export function Fade({
  stop,
  blur,
  side = "top",
  className,
  background,
  style,
  ref,
}: {
  stop?: string;
  blur?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  background: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-fade
      className={`${styles.root}${className ? ` ${className}` : ""}`}
      data-side={side}
      style={
        {
          "--stop": stop,
          "--blur": blur,
          "--background": background,
          ...style,
        } as React.CSSProperties
      }
    />
  );
}
