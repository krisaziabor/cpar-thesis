import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";
import { Agentation } from "agentation";

export const metadata: Metadata = {
  title: "Kanon",
  description: "Voice-driven community libraries",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
