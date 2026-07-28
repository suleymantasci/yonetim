#!/usr/bin/env node
/**
 * Bundle bütçesi kapısı — MIMARI-PLAN §12.3 / §15.
 *
 * NEDEN VAR: §12.3 "bütçe 250 kB" diyordu ama hiçbir yerde ölçülmüyordu.
 * Bunun somut bedeli bu depoda görüldü: `packages/ui` barrel'ından yapılan
 * tek bir `export *` satırı, pazarlama sitesinin ilk yükünü 137 kB'den
 * 184 kB'ye çıkardı — sayfada tek bir animasyon olmadan. Kimse fark etmezdi.
 *
 * NASIL ÖLÇER: `next build` sonrası `.next/app-build-manifest.json` her giriş
 * noktası için istemci parçalarını listeler. Bir sayfanın gerçek ilk yükü
 * **layout zinciri + sayfanın kendisi** birleşimidir; manifest bunları ayrı
 * girdilerde tuttuğu için tek başına bir girdiyi ölçmek yanıltıcı olur
 * (`/[locale]/page` layout'suz ölçülürse eksik, `/[locale]/layout` tek başına
 * ölçülürse hangi sayfaya ait olduğu belirsiz çıkar).
 *
 * Parçaların **gzip'lenmiş** birleşimi alınır. Bu sayı Next'in "First Load JS"
 * kolonundan biraz yüksektir ve bilerek öyle: Next gecikmeli (`import()`)
 * yüklenen parçaları saymıyor, biz sayıyoruz. Kullanıcının indirdiği bayt
 * hidrasyondan önce mi sonra mı geldiğine bakmaksızın bant genişliği ve
 * ayrıştırma maliyeti üretiyor. CSS hariç: bütçe §12.3'te JS için tanımlı.
 *
 * Görsel/OG üreten route'lar ve `route.ts` uçları hariç: bunların istemci
 * yükü yok, ölçüm anlamsız kalabalık üretir.
 *
 * Kullanım:  node scripts/bundle-budget.mjs [--json]
 * Çıkış kodu 1 = en az bir route bütçeyi aştı.
 */

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** MIMARI-PLAN §12.3. Değiştirmek bir mimari karardır, bir ayar değil. */
const BUDGET_KB = 250;

/**
 * Uyarı eşiği: bütçenin %85'i. Kırmızıya dönmeden önce bir tur uyarı vermek,
 * regresyonu ekleyen değişikliğin yanında yakalamayı mümkün kılıyor.
 */
const WARN_RATIO = 0.85;

const APPS = [
  { name: "@yonetim/web", dir: "apps/web" },
  { name: "@yonetim/app", dir: "apps/app" },
];

/** İstemci JS'i olmayan route'lar — ölçülecek bir şey yok. */
const SKIP = /\/(route|opengraph-image|apple-icon|icon|sitemap\.xml|robots\.txt)$/;

function gzippedSize(path) {
  if (!existsSync(path) || !statSync(path).isFile()) return 0;
  return gzipSync(readFileSync(path)).byteLength;
}

function measure({ name, dir }) {
  const manifestPath = join(dir, ".next/app-build-manifest.json");
  if (!existsSync(manifestPath)) {
    return { name, error: `${manifestPath} yok — önce \`pnpm --filter ${name} build\` çalıştırın.` };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const cache = new Map();
  const sizeOf = (file) => {
    if (!cache.has(file)) cache.set(file, gzippedSize(join(dir, ".next", file)));
    return cache.get(file);
  };

  /** `/a/b/page` → ["/layout", "/a/layout", "/a/b/layout"] (var olanlar). */
  const layoutChain = (pageKey) => {
    const segments = pageKey.replace(/\/page$/, "").split("/").filter(Boolean);
    const chain = ["/layout"];
    let prefix = "";
    for (const segment of segments) {
      prefix += `/${segment}`;
      chain.push(`${prefix}/layout`);
    }
    return chain.filter((key) => manifest.pages[key]);
  };

  const routes = Object.entries(manifest.pages)
    .filter(([key]) => key.endsWith("/page") && !SKIP.test(key))
    .map(([key]) => {
      const files = new Set(
        [...layoutChain(key), key]
          .flatMap((entry) => manifest.pages[entry] ?? [])
          .filter((file) => file.endsWith(".js")),
      );
      let bytes = 0;
      for (const file of files) bytes += sizeOf(file);
      return { route: key.replace(/\/page$/, "") || "/", kb: bytes / 1024 };
    })
    .sort((a, b) => b.kb - a.kb);

  /**
   * `next/dynamic` ile yüklenen parçalar hiçbir giriş noktasının listesinde
   * yer almaz — Next onları ayrı tutar ve "First Load JS"e saymaz. §12.3'ün
   * niyeti de bu ("ECharts yalnız grafik olan sayfalarda `next/dynamic` ile
   * yüklenir; panel iskeletine girmez"). Yine de görünmez olmamaları gerekir:
   * bütçeyi bilgilendirme olarak raporluyoruz.
   */
  const referenced = new Set(Object.values(manifest.pages).flat());
  const chunkDir = join(dir, ".next/static/chunks");
  const lazy = existsSync(chunkDir)
    ? readdirSync(chunkDir, { recursive: true })
        .map((entry) => `static/chunks/${String(entry).split("\\").join("/")}`)
        // Pages Router'ın çalışma zamanı parçaları app-build-manifest'te
        // görünmez ama gecikmeli de değil; listeyi kirletmesinler.
        .filter((file) => !/\/(framework|polyfills|main|webpack)-|\/pages\//.test(file))
        .filter((file) => file.endsWith(".js") && !referenced.has(file))
        .map((file) => ({ file, kb: gzippedSize(join(dir, ".next", file)) / 1024 }))
        .filter((chunk) => chunk.kb >= 20)
        .sort((a, b) => b.kb - a.kb)
    : [];

  return { name, routes, lazy };
}

const results = APPS.map(measure);
const asJson = process.argv.includes("--json");

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
}

let failed = false;

for (const result of results) {
  if (result.error) {
    console.error(`✖ ${result.name}: ${result.error}`);
    failed = true;
    continue;
  }

  const worst = result.routes[0];
  if (!worst) continue;

  const over = result.routes.filter((r) => r.kb > BUDGET_KB);
  const near = result.routes.filter((r) => r.kb > BUDGET_KB * WARN_RATIO && r.kb <= BUDGET_KB);

  if (!asJson) {
    console.log(
      `\n${result.name} — en ağır route: ${worst.route} · ${worst.kb.toFixed(1)} kB (bütçe ${BUDGET_KB} kB)`,
    );
    for (const route of result.routes.slice(0, 5)) {
      console.log(`   ${route.kb.toFixed(1).padStart(7)} kB  ${route.route}`);
    }
    if (result.lazy.length) {
      console.log("   gecikmeli (next/dynamic — ilk yüke dahil değil):");
      for (const chunk of result.lazy.slice(0, 3)) {
        console.log(`   ${chunk.kb.toFixed(1).padStart(7)} kB  ${chunk.file}`);
      }
    }
  }

  for (const route of near) {
    console.warn(`⚠ ${result.name} ${route.route}: ${route.kb.toFixed(1)} kB — bütçenin %85'ini aştı.`);
  }
  for (const route of over) {
    console.error(`✖ ${result.name} ${route.route}: ${route.kb.toFixed(1)} kB > ${BUDGET_KB} kB`);
    failed = true;
  }
}

if (failed) {
  console.error(
    "\nBütçe aşıldı. Ağır bağımlılığı `next/dynamic` ile sayfaya taşıyın ya da " +
      "barrel yerine alt yol ithali kullanın (bkz. packages/ui/src/index.ts).",
  );
  process.exit(1);
}

console.log("\n✔ Tüm route'lar bütçe içinde.");
