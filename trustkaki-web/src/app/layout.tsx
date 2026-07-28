import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
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
    <html lang="en" className="h-full antialiased">
      <body className={`${sourceSans.variable} ${sourceSerif.variable} flex h-full flex-col`}>
        {children}
      </body>
    </html>
  );
}
