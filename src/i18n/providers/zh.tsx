"use client";

import type { ReactNode } from "react";

import { LocaleProvider } from "../client";
import messages from "../messages/zh";

// Functions in the dictionary stay inside this client boundary, never in RSC props.
export default function Provider({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider locale="zh" messages={messages}>
      {children}
    </LocaleProvider>
  );
}
