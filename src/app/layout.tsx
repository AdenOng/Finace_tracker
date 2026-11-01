import "~/styles/globals.css";

import { type Metadata } from "next";
import {
  Bricolage_Grotesque,
  Geist,
  Geist_Mono,
  Noto_Sans_SC,
} from "next/font/google";

import { LocaleProvider } from "~/i18n/client";
import { htmlLang } from "~/i18n/config";
import { getLocale, getT } from "~/i18n/server";
import { TRPCReactProvider } from "~/trpc/react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: { default: "Finfolio", template: "%s · Finfolio" },
    description: t.shell.meta.description,
    icons: [{ rel: "icon", url: "/favicon.svg", type: "image/svg+xml" }],
  };
}

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
// Simplified Chinese glyphs, sliced by unicode range: only Chinese pages download any of it.
const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  preload: false,
  variable: "--font-noto-sc",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html
      lang={htmlLang[locale]}
      className={`${geist.variable} ${geistMono.variable} ${bricolage.variable} ${notoSansSC.variable}`}
    >
      <body className="min-h-dvh font-sans">
        <LocaleProvider locale={locale}>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
