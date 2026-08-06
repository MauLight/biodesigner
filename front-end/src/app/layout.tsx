import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "BioDesigner",
  description: "BioDesigner.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased font-sans ${geist.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
