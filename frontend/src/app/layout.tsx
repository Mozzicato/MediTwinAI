import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediTwin | Synthetic Demo Twin",
  description: "A synthetic health-context demonstration.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
