import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YURA AI School",
  description: "YURA AI School enrollment system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
