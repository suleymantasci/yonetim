"use client";

import { useState, type ReactNode } from "react";

import { cn } from "../cn";

/**
 * Sekmeli görünüm — **gezinmesiz**.
 *
 * NEDEN BAĞLANTI DEĞİL DE DURUM (state):
 *
 * Sekmeler `Tabs` ile URL bağlantısı olarak çalışıyordu ve tarayıcıda
 * güvenilir değildi: ilk tıklama geçiyor, sonrakiler hiçbir şey yapmıyordu.
 * Kullanıcının tarifi "bazen çift tık ile değişiyor, bazen hiç değişmiyor".
 *
 * Üretim derlemesinde, gerçek Chrome'da (CDP ile) ölçüldü:
 *   - tıklama doğru `<a>` etiketine ulaşıyor (`elementFromPoint` doğruluyor),
 *   - `next/link` olayı yakalayıp `preventDefault` çağırıyor
 *     (`defaultPrevented: true`),
 *   - RSC isteği gidiyor ve **200** dönüyor,
 *   - ama adres ve içerik değişmiyor.
 *
 * Yani gezinme yönlendiricinin içinde düşüyor. Sekme şeridini `"use client"`
 * yapıp `next/link`'i doğrudan import etmek **çözmedi** (temiz sunucuda ayrıca
 * doğrulandı). Düz `<a>` ile tam gezinme çalışıyor — borçlar ekranındaki
 * görünüm sekmeleri o yolu kullanıyor (`components/nav-tabs.tsx`), çünkü orada
 * her görünüm farklı veri çekiyor.
 *
 * Bu yüzden sekmeler artık **gezinmiyor**. Detay ekranlarında zaten tüm veri
 * tek API çağrısıyla geliyor (`birimler/[id]` başlığındaki "sekme geçişi
 * anlık" notu tam olarak bunu söylüyordu), dolayısıyla sekme değiştirmek için
 * sunucuya gitmek **hiç gerekmiyordu**: paneller sunucuda render edilip
 * buraya veriliyor, burası hangisinin görüneceğine karar veriyor. Geçiş artık
 * ağ turu olmadan, anında.
 *
 * URL YİNE DE GÜNCELLENİYOR (`history.replaceState`): `?sekme=kvkk` bağlantısı
 * paylaşılabilir kalıyor ve sayfa yenilenince aynı sekme açılıyor. `replace`
 * seçildi çünkü `push` her sekmeyi geçmişe yazar ve geri tuşu kullanıcıyı
 * sayfadan çıkarmak yerine sekmeler arasında dolaştırırdı. Bedeli: geri tuşu
 * sekme değiştirmiyor — sekme bir kayıt değil, aynı kaydın bir görünümü.
 *
 * `history.replaceState` **doğrudan** çağrılıyor, `router.replace` değil:
 * yukarıdaki ölçümün gösterdiği gibi sorun yönlendiricinin kendisinde.
 */

export interface TabViewItem {
  key: string;
  label: string;
  count?: number;
  /** Sekmenin içeriği — sunucuda render edilip buraya veriliyor. */
  panel: ReactNode;
}

export function TabView({
  items,
  initialKey,
  label,
  /** URL'de tutulacak arama parametresi. Boşsa adres hiç değişmez. */
  searchParam = "sekme",
  /** Bu anahtar seçiliyken parametre adresten düşer (varsayılan sekme). */
  defaultKey,
}: {
  items: TabViewItem[];
  initialKey: string;
  label: string;
  searchParam?: string;
  defaultKey?: string;
}) {
  const [active, setActive] = useState(
    () => items.find((i) => i.key === initialKey)?.key ?? items[0]?.key ?? "",
  );

  const select = (key: string) => {
    setActive(key);
    if (!searchParam || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (key === (defaultKey ?? items[0]?.key))
      url.searchParams.delete(searchParam);
    else url.searchParams.set(searchParam, key);
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      {/*
        `<button>` kullanılıyor, `<a>` değil: bu artık bir gezinme değil, aynı
        sayfadaki bir görünüm değişikliği. Bağlantı gibi göstermek, orta tık ve
        "yeni sekmede aç" gibi çalışmayan davranışlar vaat ederdi.
        `role="tablist"` ile birlikte klavye desteği tarayıcının doğal sekme
        (Tab) dolaşımından geliyor.
      */}
      <div className="mb-4">
        <div
          role="tablist"
          aria-label={label}
          className="-mb-px overflow-x-auto border-b border-border"
        >
          <div className="flex min-w-max gap-1">
            {items.map((item) => {
              const isActive = item.key === active;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  id={`tab-${item.key}`}
                  aria-selected={isActive}
                  aria-controls={`panel-${item.key}`}
                  onClick={() => select(item.key)}
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "border-primary text-fg"
                      : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {item.label}
                  {item.count !== undefined ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                        isActive
                          ? "bg-primary-soft text-primary-soft-fg"
                          : "bg-surface-sunken text-fg-subtle",
                      )}
                    >
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/*
        Pasif paneller DOM'da kalıyor ama `hidden` ile gizleniyor: kaldırıp
        yeniden basmak, içindeki istemci bileşenlerinin (form durumu, açık
        çekmece) durumunu sekme değiştikçe sıfırlardı. `hidden` özniteliği
        ekran okuyuculardan da gizliyor.
      */}
      {items.map((item) => (
        <div
          key={item.key}
          id={`panel-${item.key}`}
          role="tabpanel"
          aria-labelledby={`tab-${item.key}`}
          hidden={item.key !== active}
        >
          {item.panel}
        </div>
      ))}
    </>
  );
}
