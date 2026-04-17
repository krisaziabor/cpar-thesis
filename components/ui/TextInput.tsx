import { forwardRef, type InputHTMLAttributes } from "react";

/** Shared Tailwind class string for the dark-themed bordered input variant. */
export const TEXT_INPUT_BASE_CLASSES =
  "w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Standard bordered dark input. Consolidates the same Tailwind string that
 * was duplicated across search/connect/hold/item-edit/admin forms.
 *
 * Extra `className` is appended, so callers can override (e.g. `font-sans
 * text-xs`) without forking the base styles.
 */
const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput({ className, type = "text", ...rest }, ref) {
    const merged = className
      ? `${TEXT_INPUT_BASE_CLASSES} ${className}`
      : TEXT_INPUT_BASE_CLASSES;
    return <input ref={ref} type={type} className={merged} {...rest} />;
  }
);

export default TextInput;
