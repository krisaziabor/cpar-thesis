import { forwardRef, type TextareaHTMLAttributes } from "react";

/** Shared Tailwind class string for the dark-themed bordered textarea. */
export const TEXTAREA_BASE_CLASSES =
  "w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Standard bordered dark textarea, matching the visual language of
 * `TextInput`. Callers can append classes (e.g. `resize-none rounded-lg`)
 * via `className`.
 */
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...rest }, ref) {
    const merged = className
      ? `${TEXTAREA_BASE_CLASSES} ${className}`
      : TEXTAREA_BASE_CLASSES;
    return <textarea ref={ref} className={merged} {...rest} />;
  }
);

export default Textarea;
