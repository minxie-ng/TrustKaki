import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustKaki — AI Care Companion",
  description:
    "TrustKaki is a multi-agent AI companion for elderly care in Singapore. Monitoring daily living, health, social engagement, and digital safety for seniors aging in place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50">{children}</body>
    </html>
  );
}
