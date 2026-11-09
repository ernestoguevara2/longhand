import type { Metadata } from "next";
import { Hanken_Grotesk, Literata } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const ui = Hanken_Grotesk({ variable: "--font-ui", subsets: ["latin"] });
const reading = Literata({ variable: "--font-reading", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Longhand",
  description: "Scan writing for signs of AI, see why each sentence was flagged, and rewrite it without losing the facts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ui.variable} ${reading.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
