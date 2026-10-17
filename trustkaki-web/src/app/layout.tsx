import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const headingFont = Manrope({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustKaki — AI Last-Mile Engagement for Seniors",
  description:
    "Proactive AI check-ins for isolated seniors. Built for SMU AI Club × Tencent Cloud 'AI CAN DO IT / Age Well' Hackathon.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable} h-full antialiased`}>
      <body className="flex h-full flex-col">
        {children}
      </body>
    </html>
  );
}
