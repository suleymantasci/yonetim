# Dijital Asistan (panel asistanı)

Dijital Asistan bir SaaS'tır; kodu Vekil'e kopyalanmaz. Vekil yalnız iki şey sağlar:

1. **Script** — panel yerleşimine genel sitelerdekiyle aynı tek satır (`embed.js`).
2. **Veri ucu** — `POST /v1/dijital-asistan/context` ve `POST /v1/dijital-asistan/run`.

Sözleşme: Dijital Asistan deposu `docs/uygulama-baglantisi.md` (v1). Kayıtlar Vekil'den kullanıcının
tarayıcısına gider; Dijital Asistan sunucusuna gitmez. Soru anlama, takip soruları, görünüm ve metinler
Dijital Asistan'da değişir; Vekil'de deploy gerektirmez.

## Parçalar

| Parça | Yer |
|---|---|
| Veri ucu | `apps/api/src/integration/assistant/assistant.{controller,service,module}.ts` |
| Ekran listesi (menüyle aynı izinler) | `apps/api/src/integration/assistant/assistant.screens.ts` |
| Script | `apps/app/src/components/assistant/assistant-script.tsx`, `app/panel/layout.tsx` (`key` = site + kullanıcı) |
| Kurulum değerleri | `apps/app/src/lib/assistant.ts` (istek anında okunur) |
| CSP | `apps/app/src/middleware.ts` — `DA_ORIGIN` doluysa script/style/connect/frame izni |

## Araçlar

| Araç | İzin | Parametre | Sonuç |
|---|---|---|---|
| `borc` | `debt:read` (tüm site) / `debt:read_own` (kendi bölümleri) | `unit` (blok, numara, kişi adı, id) | Kalan ve vadesi geçmiş borç, açık kalemler |
| `odemeler` | `payment:read` / `payment:read_own` | `unit` | Son 6 ödeme |
| `takvim` | `agenda:read` | `period` | Kendi ve paylaşılan takvim kayıtları |

- Yönetici bölüm belirtmeden sorarsa `ask` ("Hangi bağımsız bölüm?") döner; kullanıcının sonraki cevabı
  bu soruyu tamamlar. Birden çok eşleşmede `choose` seçenekleri döner.
- Sakin yalnız kendi aktif bölümlerini görür; isimle arama sakinde reddedilir.
- **Yeni veri türü:** `tools()` listesine araç tanımı, `run()` içine işleyici. Dijital Asistan'da değişiklik yok.

## Ortam değişkenleri

| Değişken | Servis | Değer |
|---|---|---|
| `DA_SECRET` | api | Kurulum → Uygulama verisi → Gizli anahtar (`das_…`). Takma ad + imza. Boşsa uçlar 404. |
| `DA_ORIGIN` | app | `https://asistan.tasci.cloud` |
| `DA_INSTALLATION_ID` | app | Kurulum kodundaki `data-installation` |
| `DA_VERIFICATION` | app | Kurulum kodundaki `data-verification` |

Asistan panelinde kurulumun veri ucu: `/v1/dijital-asistan`. Test ortamı (vekil): profil "Vekil Panel",
kurulum `015b9f81-…`, değerler `/docker/yonetim/.env`.
