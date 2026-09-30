import type { Metadata } from "next";
import "./globals.css";
import "./date-picker.css";
import "./auth.css";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "Jaap Tally",
  description: "A calm place for your daily jaap practice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
