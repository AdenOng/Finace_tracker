import "~/styles/globals.css";

import { type Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: { default: "Finfolio", template: "%s · Finfolio" },
  description: "Net worth and spending across every account you hold.",
  icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
};

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
  variable: "--font-bricolage",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${bricolage.variable}`}
    >
      <body className="min-h-dvh font-sans">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
