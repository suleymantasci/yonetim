import type { ReactNode } from "react";

import "./globals.css";

/**
 * Kök layout — `<html>` etiketi dile göre `[locale]/layout.tsx` içinde üretilir.
 * Bu dosya yalnızca global stilleri yükler ve alt ağacı geçirir.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
