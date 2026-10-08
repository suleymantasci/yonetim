"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ToastProvider } from "@yonetim/ui";

import { Sidebar, type SidebarProps } from "./sidebar";

/**
 * Panel kabuğu (istemci katmanı).
 *
 * Tek sorumluluğu mobil çekmecenin açık/kapalı durumunu header'daki hamburger
 * ile sidebar arasında paylaşmak. Geri kalan her şey sunucu bileşenlerinden
 * `ReactNode` olarak geçirilir — böylece menü etiketleri, rozet sayıları ve
 * kullanıcı bilgisi istemci paketine girmez.
 *
 * `ToastProvider` burada kurulur: panelin her yerinden `useToast()` çalışır.
 */
export function ShellFrame({
  sidebar,
  headerLeft,
  headerRight,
  banner,
  children,
  labels,
}: {
  sidebar: Omit<SidebarProps, "open" | "onClose">;
  headerLeft: ReactNode;
  headerRight: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  labels: { openMenu: string; skipToContent: string; closeToast: string };
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <ToastProvider closeLabel={labels.closeToast}>
      <a href="#panel-content" className="skip-link">
        {labels.skipToContent}
      </a>

      <div className="panel-shell flex min-h-dvh">
        <Sidebar {...sidebar} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="panel-toolbar print:hidden sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-md sm:px-4">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label={labels.openMenu}
              aria-expanded={drawerOpen}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-strong text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu aria-hidden className="h-5 w-5" />
            </button>

            {headerLeft}

            <div className="ml-auto flex items-center gap-1.5">{headerRight}</div>
          </header>

          {banner ? <div className="print:hidden">{banner}</div> : null}

          {/*
           * İçerik ölçüsü sınırlı: 2560px'lik bir ekranda tabloyu duvardan
           * duvara germek satır takibini imkânsızlaştırıyor. Sınır kabukta,
           * sayfalarda değil — yoksa 40 sayfada tek tek unutulurdu.
           */}
          <main id="panel-content" className="min-w-0 flex-1 bg-canvas">
            <div className="mx-auto w-full max-w-[1600px] p-4 lg:p-6 print:p-0">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
