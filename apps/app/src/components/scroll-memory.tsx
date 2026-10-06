"use client";

/**
 * Sayfanın kaydırma konumunu hatırlar — çekmece açılıp kapanırken geri
 * yazmak için (`route-drawer.tsx`).
 *
 * NEDEN AYRI VE PANELDE HEP YÜKLÜ: Next, çekmece rotasına gezinirken ilk
 * commit'te (çekmece henüz yüklenmemişken) kaydırmayı sıfırlıyor. Çekmece
 * modülü ise ancak sonraki aşamada yükleniyor; izleyici orada başlasaydı konum
 * zaten 0 olurdu. Panel açıldığında yüklendiği için sıfırlamadan önceki
 * değeri tutuyor.
 *
 * SIFIRLAMAYI "SON KONUM" SAYMAMAK: Next'in zorladığı atlama, diyalog henüz
 * yokken geliyor ve sıradan bir kaydırma olayı gibi görünüyor. Kullanıcı
 * girdisi (tekerlek, dokunma, klavye, fare) olmadan, yüksek bir konumdan
 * 0'a inen kaydırma **programatik sıfırlama** sayılıyor: son gerçek konum
 * korunuyor. Çekmece açılırsa (2 sn içinde diyalog belirirse) o konum geri
 * yazılıyor; açılmazsa (sıradan sayfa geçişi) sıfır doğru konum olarak
 * kabul ediliyor — sayfa geçişinde sayfanın başına gidilmesi beklenen davranış.
 */
let lastPageScrollY = 0;
let lastInputAt = 0;
let resetTimer: ReturnType<typeof setTimeout> | undefined;
let installed = false;

const INPUT_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"] as const;
const RESET_GRACE_MS = 2000;

function dialogOpen() {
  return Boolean(document.querySelector('[role="dialog"]'));
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  lastPageScrollY = window.scrollY;

  for (const name of INPUT_EVENTS) {
    window.addEventListener(name, () => (lastInputAt = performance.now()), {
      capture: true,
      passive: true,
    });
  }

  window.addEventListener(
    "scroll",
    () => {
      if (dialogOpen()) return;
      const y = window.scrollY;
      const programmaticReset =
        y <= 1 && lastPageScrollY > 100 && performance.now() - lastInputAt > 400;

      if (programmaticReset) {
        // Konumu koru; çekmece gelmezse bu sıradan bir sayfa geçişiydi.
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          if (!dialogOpen()) lastPageScrollY = window.scrollY;
        }, RESET_GRACE_MS);
        return;
      }
      clearTimeout(resetTimer);
      lastPageScrollY = y;
    },
    { passive: true },
  );
}

install();

export function getLastPageScrollY(): number {
  return lastPageScrollY;
}

/** Panel kabuğuna konur; render etmez, yalnız modülün erken yüklenmesini sağlar. */
export function ScrollMemory() {
  install();
  return null;
}
