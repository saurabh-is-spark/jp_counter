import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jaap Tally",
  description: "A calm place for your daily jaap practice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
