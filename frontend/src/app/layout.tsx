import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });

export const metadata: Metadata = {
  title: "MediTwin · Personal health context",
  description: "MediTwin connects an OntoMorph digital twin to HOLON clinical knowledge, a deterministic signal engine, 3D anatomy and evidence-cited explanations. Synthetic demo, not a diagnosis.",
};

export const viewport: Viewport = { themeColor: "#0e2a30" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
