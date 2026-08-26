import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Autonomous Research Agent",
  description: "Autonomous AI Research Agent with Live Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      {/* Suppress hydration mismatch warning caused by browser extensions like ColorZilla injecting attributes into <body> before React hydrates */}
      <body
        suppressHydrationWarning={true}
        className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500 selection:text-white"
      >
        <Navbar />
        <div className="flex-1 w-full flex flex-col">{children}</div>
      </body>
    </html>
  );
}
