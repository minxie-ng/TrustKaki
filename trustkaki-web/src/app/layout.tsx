import type { Metadata } from "next";
import "./globals.css";

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
      <body className="h-full flex flex-col">{children}</body>
    </html>
  );
}
