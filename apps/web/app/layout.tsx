import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Glasshouse — AI Agent Flight Recorder", description: "Tamper-evident replay for coding agents" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
