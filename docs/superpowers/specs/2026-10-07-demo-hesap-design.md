# Demo hesap (24 saatlik, kendi kendine açılan) — tasarım

Tarih: 2026-10-07 · Durum: onaylandı (kullanıcı, 2026-10-07)

## Amaç

Landing'e gelen bir yönetici ya da yönetim firması, iletişim bilgilerini
bırakıp e-postasını doğruladıktan sonra **her modülü dolu** bir demo hesabıyla
ürünü hemen deneyebilsin. Hesap 24 saat yaşar, sonra tenant **bütün verisiyle
fiziksel olarak silinir** (sunucuda/DB'de yer kaplamaz). İletişim bilgisi
(talep kaydı) satış takibi için kalır; süre bitmeden "gerçek hesap aç" daveti
gider.

## Kararlar (kullanıcı)

- Tip: `manager` → 1 site, `company` → firma + 3 site; her sitede 30–50
  bağımsız bölüm, birden çok blok, tüm modüller dolu.
- Herkese aynı içerik: kodla, sabit tohumla üretilen deterministik seed;
  tarihler "şimdi"ye göre kaydırılır (yaklaşım 1 — şablon kopyalama değil).
- Demo girişi üretilmiş adres: `demo-xxxx@demo.tasci.cloud` + rastgele parola;
  kişinin kendi e-postası yalnız talep kaydında durur (gerçek kullanıcıyla
  çakışma imkânsız; gerçek kayıt demo kullanıcıya bağlanamaz).
- Mail: SMTP (sunucudaki docker-mailserver), gönderen `noreply@tasci.cloud`.
- Süre sonunda talep kaydı kalır (seçenek C) + bitişten ~3 saat önce
  "gerçek hesabını aç" maili.
- Fiziksel silme yalnız demo tenant'larda; manuel uç yalnız `super_admin`.

## Akış

1. Landing formu (`apps/web`): ad soyad, telefon, e-posta, tip, KVKK rıza,
   gizli bal küpü alanı → `POST /v1/demo-requests`.
2. API limitleri kontrol eder, `demo_requests` satırı (`pending`) yazar,
   onay token'ının **hash'ini** saklar, `noreply@tasci.cloud`'dan onay linki
   gönderir (tek kullanımlık, 1 saat).
3. Link → panel `/demo/{token}` sayfası → `POST /v1/demo-requests/confirm`:
   satır `provisioning`, worker'a `demo.provision` işi. Sayfa durumu yoklar.
4. Worker tenant(lar)ı üretir; satır `ready`; giriş bilgileri maille gider ve
   (yalnız onay oturumunda, bir kez) ekranda gösterilir; "Panele git".
5. Aynı link ikinci kez → yeni demo açılmaz, mevcut durum gösterilir.

## Veri modeli

- `tenants.is_demo boolean default false`, `tenants.demo_expires_at`.
- `companies.is_demo boolean default false`.
- `users.is_demo boolean default false`.
- `demo_requests`: id, full_name, phone, email, kind (`manager|company`),
  status (`pending|provisioning|ready|failed|expired|purged`), token_hash,
  token_expires_at, ip, user_agent, consent_at, login_email,
  user_id, company_id, tenant_ids (uuid[]), expires_at, reminder_sent_at,
  error, created_at, updated_at, confirmed_at, ready_at, purged_at.
  Platform tablosu (tenant_id yok → RLS dışı, yalnız bypass bağlamında).

## Seed üretici (`packages/demo-seed`)

Deterministik (sabit tohumlu PRNG), `now` parametresiyle. Her site: bloklar,
30–50 bağımsız bölüm, malik/kiracı sakinler, 12 ay aidat borçlandırması ve
karışık ödemeler (zamanında/geç/kısmi/ödenmemiş), kasa/banka, gider ve
kategoriler, tedarikçi carisi, personel + personel carisi, arıza/bakım
talepleri (açık/devam/kapalı), planlı bakımlar + geçmiş, duyurular,
toplantı/karar, rezervasyon, sayaç, kargo/ziyaretçi, açılış fişi. Sakin
e-postaları `@demo.tasci.cloud`, telefonlar ayrılmış test aralığı.

## Demo tenant davranışı

- Dış kanallar (SMS, WhatsApp, e-posta) kapalı; bildirim yalnız uygulama içi.
- Faturalama/paket işlemleri kapalı; platform metriklerinde sayılmaz.
- Panel üstünde şerit: "Demo hesap · X sa Y dk kaldı · Gerçek hesap aç".

## Silme

- `demo.purge` (her 15 dk): süresi dolmuş demolar; her biri ayrı transaction.
- DB fonksiyonu `app_purge_demo_tenant(uuid)`: `is_demo` değilse
  EXCEPTION; `app.allow_log_purge` ile kütükleri de siler; tenant_id taşıyan
  her tabloyu siler, sonra tenant'ı. Demo kullanıcılar/oturumlar/firma ayrıca.
- Talep satırı `purged` olur (iletişim bilgisi kalır).
- `demo.expiry-reminder`: bitişe ≤3 saat kalan, hatırlatma gitmemiş → mail.
- `/yonetim/demo-talepleri`: liste + "şimdi sil" (yalnız super_admin, demo
  kodunu yazarak onay).

## Kötüye kullanım

E-posta başına 1 aktif demo; IP başına günde 3 talep; en çok 50 eşzamanlı
demo (env ile ayarlanır); token hash'lenir; bal küpü; tek kullanımlık e-posta
domainleri reddedilir; limit mesajları anlaşılır.

## Hatalar

Provision yarıda kalırsa yarım tenant aynı silme yoluyla temizlenir,
satır `failed`; "tekrar dene" mümkün. Mail gitmezse bilgiler ekranda.
`provisioning`'de 10 dk'dan uzun kalan → `failed` + temizlik.

## Test

Seed: determinizm, satır sayıları, mizan dengesi. Silme: tenant'a ait satır
kalmaz; demo olmayan tenant reddedilir. Limitler. Vekil'de uçtan uca.
