import type { TailwindConfig } from "@react-email/components";

/** Tailwind theme aligned with login: black field, Lector + DieGrotesk, zinc text. */
export const kanonEmailTailwindConfig = {
  theme: {
    extend: {
      fontFamily: {
        lector: ['Lector', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['DieGrotesk', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        kanon: {
          bg: '#000000',
          title: 'rgba(255,255,255,0.9)',
          body: '#a1a1aa',
          primary: '#d4d4d8',
          quiet: '#71717a',
          stroke: '#3f3f46',
        },
      },
    },
  },
} satisfies TailwindConfig;
