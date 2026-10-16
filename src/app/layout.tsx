import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "C100 Membership Hub", template: "%s · C100 Membership Hub" },
  description: "Membership, attendance and recognition management for Collegiate 100 at Georgia State University.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0e1b33", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
