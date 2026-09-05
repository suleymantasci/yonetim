/**
 * Görsellerin altlığı — köşesi pahlı **parsel** bloğu ve kaydırılmış kontürü.
 *
 * NEDEN CSS'TE, GÖRSELİN İÇİNDE DEĞİL: Sektörün alışkanlığı, markanın rengini
 * doğrudan PNG'nin içine gömmek. O PNG koyu temada yanlış renkte kalır, marka
 * rengi değiştiğinde bayatlar ve her yeni görselde aynı şeklin yeniden
 * çizilmesini gerektirir. Şekil burada durursa görselden istenen tek şey
 * **şeffaf zeminli özne** olur.
 *
 * NEDEN BU ŞEKİL: Dikdörtgenin bir köşesi 45°'de kesik — vaziyet planındaki
 * parsel/blok işareti. Arkasındaki `BlueprintGrid` ile aynı dili konuşuyor.
 *
 * NEDEN DOLU BLOK DEĞİL: İlk hâli koyu, dolu bir gradyan bloktu. Görselin
 * kendisi de arka planında bir renk taşıdığında (elimizdeki geçici PNG'ler
 * öyle) iki şekil birbiriyle yarışıyor ve hata gibi duruyordu. Şimdi yalnız
 * ince kontür + çok yumuşak bir yıkama var: şeffaf zeminli görselde çerçeve
 * olarak, zeminli görselde görünmez bir hâle olarak çalışıyor — yani görsel
 * değiştiğinde bileşenin ayar gerektirmemesi için.
 *
 * SVG `id` KULLANILMIYOR: Yıkama CSS tarafında, kontür düz `stroke`. Bileşen
 * sayfada üç kez geçiyor; `id`li bir `linearGradient` üç kopya çift kimlik
 * üretirdi.
 */

/** Sağ-alt köşesi pahlı blok. `preserveAspectRatio="none"` ile esner. */
const PLOT_CLIP = "polygon(0% 0%, 100% 0%, 100% 70%, 70% 100%, 0% 100%)";
const PLOT_PATH = "M0 0 H100 V70 L70 100 H0 Z";

export function PlotShape({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <div
      aria-hidden
      className={"pointer-events-none absolute inset-0" + (mirrored ? " -scale-x-100" : "")}
    >
      <div
        className="absolute inset-x-[6%] inset-y-[8%]"
        style={{
          clipPath: PLOT_CLIP,
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--color-primary) 12%, transparent) 0%," +
            " color-mix(in oklab, var(--color-ink) 8%, transparent) 100%)",
        }}
      />
      {/* Teknik çizim kontürü: aynı blok, birkaç piksel kaydırılmış. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-x-[10%] inset-y-[4%] text-primary"
      >
        <path
          d={PLOT_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.35"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
