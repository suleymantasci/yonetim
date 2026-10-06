import { cn } from "@yonetim/ui";

/**
 * Görünüm sekmeleri — **düz `<a>`**, `next/link` değil.
 *
 * NEDEN: bu sekmeler her görünümde farklı veri çekiyor (`/panel/borclar` borç
 * satırlarını, `?gorunum=daire` daire özetini), yani sunucuya gitmek zorunda.
 * `next/link` ile denendi ve çalışmadı: tıklama doğru `<a>`'ya ulaşıyor, Link
 * `preventDefault` çağırıyor, RSC isteği gidip 200 dönüyor, ama adres ve
 * içerik değişmiyor. Aynı davranış sakin/birim detayındaki sekmelerde de
 * görüldü (ölçüm `packages/ui/src/components/tab-view.tsx` başlığında).
 *
 * Düz bağlantı tam sayfa gezinme yapıyor: yönlendirici devrede olmadığı için
 * güvenilir. Bedeli bir tam yükleme; sunucu bu sayfayı ~100 ms'de üretiyor ve
 * zaten yeni veri çekiliyor, dolayısıyla kullanıcı açısından fark küçük.
 * Detay sayfalarındaki sekmeler bu yolu kullanmıyor çünkü orada tüm veri
 * zaten yüklü — onlar `TabView` ile hiç gezinmiyor.
 */

export interface NavTabItem {
  key: string;
  label: string;
  href: string;
  count?: number;
}

export function NavTabs({
  items,
  activeKey,
  label,
}: {
  items: NavTabItem[];
  activeKey: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="relative -mb-px overflow-x-auto border-b border-border"
    >
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <li key={item.key}>
              <a
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-fg"
                    : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {item.label}
                {item.count !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                      active
                        ? "bg-primary-soft text-primary-soft-fg"
                        : "bg-surface-sunken text-fg-subtle",
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
