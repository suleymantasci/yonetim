import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

import { config as loadDotenv } from "dotenv";

/**
 * Kök `.env` dosyasını yükler.
 *
 * Kökteki `env-loader.mjs` aynı işi Next tarafı için yapıyor ama ESM; bu
 * process CommonJS'e derleniyor ve onu `require` edemez. Mantığı kopyalamak
 * yerine `dotenv` kullanıyoruz — davranış aynı: **mevcut ortam değişkenleri
 * ezilmez**, yani üretimde Docker/systemd değişkenleri her zaman öncelikli ve
 * `.env` yoksa sessiz geçilir.
 *
 * Kök, `pnpm-workspace.yaml` aranarak bulunuyor. Göreli yol saymak (`../../..`)
 * kaynakta bir sayı, derlenmiş `dist` içinde başka bir sayı olurdu; ikisi
 * kaçınılmaz olarak birbirinden ayrışırdı.
 */
const ROOT_MARKER = "pnpm-workspace.yaml";

function findWorkspaceRoot(start: string): string | null {
  let dir = start;
  const { root } = parse(dir);
  while (true) {
    if (existsSync(join(dir, ROOT_MARKER))) return dir;
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

export function loadRootEnv(): void {
  const root = findWorkspaceRoot(__dirname) ?? findWorkspaceRoot(process.cwd());
  const candidates = [
    root ? join(root, ".env") : null,
    join(process.cwd(), ".env"),
  ].filter((c): c is string => Boolean(c));

  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path, override: false, quiet: true });
      return;
    }
  }
}
