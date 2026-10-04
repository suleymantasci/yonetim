# Üretim modunda çalıştırma

`pnpm dev` geliştirici modudur: tip kontrolü yapılmaz, kod her istekte yeniden
derlenir, Next sayfaları optimize edilmez. "Gerçek senaryoda nasıl?" sorusunun
cevabı buradaki iki yoldan biriyle alınır.

| Yol | Ne verir | Ne vermez |
| --- | --- | --- |
| **A. Yerel üretim derlemesi** (aşağıda) | Gerçek build çıktısı, `NODE_ENV=production`, gerçek verinizle | TLS, Caddy, container izolasyonu |
| **B. Docker üretim yığını** | A'daki her şey + Caddy/HTTPS + izole container'lar | — (üretimin kendisi) |

Günlük "çalışıyor mu" kontrolü için **A** yeterli; dağıtım provası için **B**.

---

## A. Yerel üretim derlemesi

### 1. Bağımlılıklar

Postgres (5432) zaten yerelde kurulu. Redis ve MinIO container'dan gelir:

```bash
docker compose -f infra/docker/docker-compose.yml up -d redis minio
```

Redis **worker için zorunlu** (BullMQ kuyruğu orada). `api` Redis'siz de
çalışır ama hız sınırlama süreç içi belleğe düşer ve oturum önbelleği devre
dışı kalır.

> Bu compose dosyasındaki `postgres` servisi **5433**'e bağlanır ve ayrı, boş
> bir veritabanıdır. `.env` 5432'yi gösterdiği için onu başlatmayın — yoksa
> "veri nerede?" sorusuyla uğraşırsınız.

### 2. Derle

```bash
pnpm build          # packages + api + app + web + worker
```

Turbo bir uygulama tip hatası verirse **tüm derleme durur**. `pnpm dev`'in
kaçırdığı hatalar burada çıkar; bu yolun asıl faydalarından biri budur.

### 3. Şemayı uygula

```bash
node apps/api/dist/apps/api/src/migrate.js
```

**Repo kökünden çalıştırın.** Bu betik `packages/db/drizzle` klasörünü çalışma
dizinine göre arıyor (container'da çalışma dizini repo köküdür); `pnpm --filter
@yonetim/api migrate` çalışma dizinini `apps/api`'ye alır ve klasörü bulamaz.

Advisory lock'lu ve tekrar çalıştırılabilir: uygulanmış migration'ları atlar.

### 4. Başlat

Dört süreç, dört terminal (ya da `&` ile arka plan):

```bash
NODE_ENV=production PORT=3100 node apps/api/dist/apps/api/src/main.js
NODE_ENV=production            node apps/worker/dist/apps/worker/src/main.js
NODE_ENV=production pnpm --filter @yonetim/app start    # panel  :3001
NODE_ENV=production pnpm --filter @yonetim/web start    # tanıtım :3000
```

| Servis | Adres | Not |
| --- | --- | --- |
| Tanıtım sitesi | http://localhost:3000 | `apps/web` |
| Panel + sakin portalı | http://localhost:3001 | `apps/app` |
| API | http://localhost:3100 | `/health`, `/health/ready`, `/docs` |
| Worker | — | HTTP dinlemez; zamanlanmış işler ve olay kuyruğu |

### 5. Çalıştığını doğrula

```bash
curl -s localhost:3100/health/ready     # {"status":"ok","checks":{"database":true,"redis":true}}
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/        # 200
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/giris   # 200
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/panel   # 307 → /giris
```

Tarayıcıda: http://localhost:3001/giris → `yonetici@ornek.test` /
`OrnekSite2026` (seed parolası; `SEED_DEMO_PASSWORD` ile değişir).

### 6. Durdur

```bash
pkill -f "apps/api/dist"; pkill -f "apps/worker/dist"; pkill -f "next start"
docker compose -f infra/docker/docker-compose.yml down     # redis + minio
```

---

## B. Docker üretim yığını (Caddy + HTTPS)

Gerçek dağıtımın aynısı: Postgres, Redis, MinIO, api, worker, app, web ve
önlerinde Caddy. Migration `api` container'ının init adımında koşar.

```bash
cp .env.example .env            # PG_*_PASSWORD, AUTH_SECRET, FIELD_ENCRYPTION_KEY,
                                # INTERNAL_API_TOKEN, MINIO_ROOT_PASSWORD zorunlu
docker compose -f infra/docker/docker-compose.prod.yml up -d --build
docker compose -f infra/docker/docker-compose.prod.yml logs -f api
```

Adresler `SITE_DOMAIN` / `APP_DOMAIN` ile belirlenir (varsayılan `localhost` ve
`panel.localhost`); Caddy sertifikayı kendisi üretir.

**Dikkat:** bu yığının Postgres'i kendi volume'ünde **boş** başlar — yereldeki
veriniz orada yoktur. `api` imajında seed betiği de yoktur (yalnız `dist`,
`drizzle` ve `sql` kopyalanır; şema init'te migrate ile kurulur, veri gelmez).
İki seçenek:

```bash
# 1) Yerel veriyi taşı
pg_dump postgresql://yonetim:yonetim@localhost:5432/yonetim \
  | docker compose -f infra/docker/docker-compose.prod.yml exec -T postgres psql -U yonetim -d yonetim

# 2) Ya da compose'daki postgres servisine geçici `ports: ["5434:5432"]` ekleyip
#    host'tan seed'i çalıştır:
DATABASE_OWNER_URL=postgres://yonetim:PAROLA@localhost:5434/yonetim pnpm db:seed
```

---

## C. Test ortamı — vekil.tasci.cloud

`main`'e her push'ta CI (`.github/workflows/ci.yml`) kalite kapılarından sonra
dört imajı derler (`ghcr.io/suleymantasci/yonetim:{api,worker,app,web}-latest`)
ve sunucuya SSH ile deploy eder.

| Adres | Servis |
| --- | --- |
| https://vekil.tasci.cloud | Tanıtım sitesi (`web`) |
| https://panel.vekil.tasci.cloud | Panel + sakin portalı (`app`), `/v1/*` → `api` |

- Tüm site **basic auth** ile korunuyor ve her yanıtta
  `X-Robots-Tag: noindex, nofollow, noarchive` var. İkisi de yalnız bu
  ortamın Traefik router'larında; gerçek domain'e geçişte eklenmez.
- Sunucu tarafı: `/docker/yonetim/` (`docker-compose.yml`, `.env` — sırlar
  yalnız orada, `deploy.sh`). Repodaki kopya: `infra/deploy/vekil/`. CI
  compose dosyasını **senkronlamaz**; değiştirirseniz sunucudaki kopyayı da
  güncelleyip `docker compose up -d` çalıştırın.
- Deploy anahtarı sunucuda `command="/docker/yonetim/deploy.sh",restrict` ile
  kısıtlı; GitHub secret'ları: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`.
  Secret yoksa CI imajları gönderir, deploy adımı uyarıyla atlanır.
- Domain değişince: workflow'daki `PUBLIC_BASE_URL` / `PUBLIC_APP_URL`
  (imajlara derleme anında gömülüyor) ve sunucu `.env`'indeki
  `SITE_DOMAIN` / `APP_DOMAIN`.
- Belge deposu (S3/R2) bu ortamda yok — MinIO resmi imajları kaldırıldı.
  Yükleme uçları "depo kurulu değil" hatası döner.
- Demo verisi bir kez elle yüklendi (`api` imajında seed betiği yok):

  ```bash
  cd /docker/yonetim && set -a && . ./.env && set +a
  docker run --rm --network yonetim_default -v /root/yonetim:/repo -w /repo \
    -e DATABASE_OWNER_URL="postgres://yonetim:${PG_OWNER_PASSWORD}@postgres:5432/yonetim" \
    -e DATABASE_URL="postgres://yonetim:${PG_OWNER_PASSWORD}@postgres:5432/yonetim" \
    -e FIELD_ENCRYPTION_KEY="$FIELD_ENCRYPTION_KEY" -e AUTH_SECRET="$AUTH_SECRET" \
    -e SEED_DEMO=true -e SEED_DEMO_PASSWORD='<parola>' \
    node:22-bookworm-slim node_modules/.bin/tsx packages/db/src/seed.ts
  ```

---

## Üretim modunda değişen davranışlar

Bunlar `pnpm dev`'de görünmez; "gerçek senaryo"da fark yaratan noktalar:

- **Oturum çerezi `Secure` olur** (`NODE_ENV=production`). `http://localhost`
  tarayıcılarca güvenli kabul edildiği için yerelde sorun çıkmaz; **LAN IP'si
  üzerinden** (`http://192.168.x.x:3001`) girmeye çalışırsanız çerez yazılmaz
  ve giriş sessizce başarısız olur. Yol B'de Caddy HTTPS verdiği için bu sorun
  yoktur.
- **Giriş parola sorar.** `AUTH_OTP_ENABLED="false"` iken parola doğruysa
  oturum hemen açılır; `"true"` yaparsanız ikinci adımda tek kullanımlık kod
  istenir. Bayrağı açmadan önce bir SMS (Netgsm / İleti Merkezi) veya e-posta
  (Resend) sağlayıcısı tanımlayın — **ikisi de boşken kod yalnız sunucu
  logunda görünür.**
- **Yapılandırılmamış entegrasyonlar sessizce devre dışıdır.** SMS konsola
  yazar, iyzico tanımsızsa kartla ödeme kapalıdır (sakin havale ekranını
  görür), Sentry kurulmaz. Uygulama çalışır ama o akışları "gerçek" sanmayın.
- **Worker Redis'e bağlıdır.** Redis yoksa zamanlanmış işler ve bildirim
  kuyruğu hiç koşmaz; panel bunu hata olarak göstermez.
