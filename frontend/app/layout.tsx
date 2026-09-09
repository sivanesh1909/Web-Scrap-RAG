import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "AethelExult.AI — Autonomous Website Scraping & Grounded RAG Platform",
  description:
    "Transform any public website into an intelligent, citation-grounded AI knowledge assistant using deep web crawling, hybrid vector databases, and neural RAG.",
  keywords: [
    "Web Scraping",
    "Website Crawler",
    "RAG",
    "Vector Database",
    "Retrieval Augmented Generation",
    "Gemini",
    "AI Knowledge Assistant",
    "OpenAI"
  ],
  authors: [{ name: "AethelExult.AI" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`}>
      <body className="bg-[#06080d] text-[#f0f4fc] min-h-screen selection:bg-cyan-500/30 selection:text-cyan-300">
        {children}
      </body>
    </html>
  );
}
