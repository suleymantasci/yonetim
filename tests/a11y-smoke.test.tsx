import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Pagination,
  Stat,
  Tabs,
  tableClasses as tc,
} from "@yonetim/ui";

/**
 * Erişilebilirlik smoke testi — UI-MODERNIZASYON-PLANI Faz 3'ün açık kalan
 * maddesi (PROJE-DURUMU §6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NEDEN BU BİÇİM
 * ─────────────────────────────────────────────────────────────────────────
 * `jest-axe` planda geçiyordu ama proje **vitest** kullanıyor ve `jest-axe`
 * Jest'in `expect` genişletme API'sine bağlı. Onun yerine `axe-core` doğrudan
 * çağrılıyor: aynı kural motoru, ara katman yok, bir bağımlılık az.
 *
 * `@testing-library/react` de eklenmedi: bu test **etkileşim** denemiyor,
 * ilk render'ın DOM'unu denetliyor. `renderToStaticMarkup` tam olarak
 * `apps/app`'in sunucuda ürettiği işaretlemeyi veriyor — yani denetlenen şey
 * kullanıcının JS gelmeden önce gördüğü sayfa.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NE YAKALAR, NE YAKALAMAZ
 * ─────────────────────────────────────────────────────────────────────────
 * Yakalar: eksik erişilebilir ad, yanlış ARIA rolü/özniteliği, bozuk liste ve
 * tablo yapısı, `id` çakışması, başlık sırası.
 *
 * **Yakalamaz: kontrast.** Kasıtlı — `color-contrast` kuralı gerçek boyama
 * gerektirir; jsdom stil hesaplamıyor ve CSS token'ları (`var(--color-fg)`)
 * çözülmemiş kalıyor. Kontrastı sahte biçimde "geçirmek" yanlış güven verirdi;
 * o katman `tests/design-tokens.test.ts` içinde token düzeyinde ölçülüyor.
 *
 * Bu bir **smoke** testi: her ekranı değil, ekranların kurulduğu ortak
 * bileşenleri kapsıyor. Bir bileşen burada temizse onu kullanan otuz ekran da
 * o kural açısından temiz.
 */

/**
 * **Tek** jsdom penceresi, dosya boyunca paylaşılıyor.
 *
 * Her denetim için yeni bir `JSDOM` kurmak çalışmıyor: `axe-core` içe
 * aktarıldığı anda global `document`'a bağlanıyor ve sonraki çağrılarda
 * başka bir belgeye ait düğüm verilince `axe.run arguments are invalid`
 * diyor. Doğru kullanım tek belge açıp gövdesini her testte değiştirmek —
 * tarayıcıda da axe tek bir belge üzerinde çalışıyor.
 */
const dom = new JSDOM(`<!doctype html><html lang="tr"><body></body></html>`);

const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;
globals.Node = dom.window.Node;
globals.Element = dom.window.Element;
globals.HTMLElement = dom.window.HTMLElement;
globals.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

/** Kontrast dışındaki tüm kuralları koşar (gerekçe dosya başlığında). */
async function auditHtml(html: string): Promise<string[]> {
  dom.window.document.body.innerHTML = html;

  const axe = (await import("axe-core")).default;
  const results = await axe.run(dom.window.document.body, {
    rules: { "color-contrast": { enabled: false } },
    resultTypes: ["violations"],
  });

  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} → ${violation.nodes
        .map((node) => node.html)
        .join(" | ")}`,
  );
}

/** Hata mesajı ihlalleri **okunur** biçimde göstersin; boş dizi beklenir. */
async function expectNoViolations(html: string) {
  const violations = await auditHtml(html);
  expect(violations, violations.join("\n")).toEqual([]);
}

describe("erişilebilirlik smoke testi — ortak bileşenler", () => {
  it("kart ve içindeki metin yapısı temiz", async () => {
    await expectNoViolations(
      renderToStaticMarkup(
        <main>
          <Card>
            <CardHeader
              title="Borçlar"
              description="Açık borçların dökümü."
            />
            <CardBody>
              <p>Örnek gövde metni.</p>
            </CardBody>
          </Card>
        </main>,
      ),
    );
  });

  it("sayaç kartları (Stat) erişilebilir ad taşıyor", async () => {
    await expectNoViolations(
      renderToStaticMarkup(
        <main>
          <Stat label="Toplam borç" value="12.400,00 ₺" />
          <Stat label="Gecikmiş" value="3.100,00 ₺" tone="danger" />
          <Stat label="Tahsilat" value="9.300,00 ₺" hint="Bu ay" />
        </main>,
      ),
    );
  });

  it("uyarı kutuları (Alert) rol ve ton kombinasyonlarında temiz", async () => {
    await expectNoViolations(
      renderToStaticMarkup(
        <main>
          <Alert tone="info">Bilgilendirme metni.</Alert>
          <Alert tone="warning">Uyarı metni.</Alert>
          <Alert tone="danger">Hata metni.</Alert>
          <Alert tone="success">Başarı metni.</Alert>
        </main>,
      ),
    );
  });

  it("rozetler tek başına renkle anlam taşımıyor, metin içeriyor", async () => {
    const html = renderToStaticMarkup(
      <main>
        <Badge tone="success">Ödendi</Badge>
        <Badge tone="danger">Gecikmiş</Badge>
        <Badge tone="neutral">Taslak</Badge>
      </main>,
    );
    await expectNoViolations(html);
    // Renk körlüğünde de okunabilmesi için rozet **metin** taşımalı: boş bir
    // rozet axe'ı geçer ama kullanıcıya hiçbir şey söylemez.
    for (const label of ["Ödendi", "Gecikmiş", "Taslak"]) {
      expect(html).toContain(label);
    }
  });

  it("veri tablosu başlık ilişkilendirmesi doğru", async () => {
    await expectNoViolations(
      renderToStaticMarkup(
        <main>
          <table className={tc.table}>
            <caption>Daire borç özeti</caption>
            <thead className={tc.thead}>
              <tr>
                <th scope="col" className={tc.th}>
                  Daire
                </th>
                <th scope="col" className={tc.th}>
                  Kalan borç
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className={tc.tr}>
                <th scope="row" className={tc.td}>
                  A/12
                </th>
                <td className={tc.tdNum}>1.250,00 ₺</td>
              </tr>
            </tbody>
          </table>
        </main>,
      ),
    );
  });

  it("boş durum ekranı temiz", async () => {
    await expectNoViolations(
      renderToStaticMarkup(
        <main>
          <EmptyState
            title="Demirbaş kaydı yok"
            description="Ortak alandaki eşyayı kaydederek başlayın."
            steps={["Kalemleri girin", "Etiketleyin", "Sayım yapın"]}
          />
        </main>,
      ),
    );
  });

  it("sekmeler erişilebilir ad ve aktif durum bildiriyor", async () => {
    await expectNoViolations(
      renderToStaticMarkup(
        <main>
          <Tabs
            activeKey="borc"
            label="Görünüm"
            items={[
              { key: "borc", label: "Borç listesi", href: "/panel/borclar" },
              {
                key: "daire",
                label: "Daire özeti",
                href: "/panel/borclar?gorunum=daire",
              },
            ]}
          />
        </main>,
      ),
    );
  });

  it("sayfalama ileri/geri düğmeleri ad taşıyor", async () => {
    await expectNoViolations(
      renderToStaticMarkup(
        <main>
          <Pagination
            page={2}
            pageCount={5}
            total={97}
            hrefFor={(page) => `?sayfa=${page}`}
            labels={{
              previous: "Önceki",
              next: "İleri",
              summary: "97 kayıttan 21-40 arası gösteriliyor",
            }}
          />
        </main>,
      ),
    );
  });

  it("denetimin kendisi çalışıyor — bilinçli bir ihlal yakalanıyor", async () => {
    /*
     * Bu test olmadan diğer sekiz test sessizce anlamsızlaşabilirdi: axe
     * yüklenemese ya da hep boş dizi dönse hepsi "geçer" görünürdü. Burada
     * kesin bir ihlal üretiliyor (adı olmayan düğme) ve yakalandığı
     * doğrulanıyor.
     */
    const violations = await auditHtml(
      `<main><button type="button"></button></main>`,
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join(" ")).toContain("button-name");
  });
});
