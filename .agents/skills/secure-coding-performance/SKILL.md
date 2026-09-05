---
name: secure-coding-performance
description: Kod tabanında ve yeni yazılan kodlarda sıfır hardcoded secret, multi-tenant izolasyonu (IDOR/BOLA engeli), SQL injection koruması, KVKK/PII veri gizliliği, N+1 sorgu ve DoS/performans standartları skilli.
---

# Güvenli Kodlama & Yüksek Performans Standartları Kılavuzu

Bu beceri (skill), platformun çok kiracılı (multi-tenant) mimarisinde bir apartman/site verisinin diğerine sızmasını (IDOR), SQL injection zafiyetlerini, kod içine şifre/anahtar gömmeyi (hardcoded secrets), PII/KVKK sızıntılarını ve performans darboğazlarını (N+1, kontrolsüz sayfalama, DoS) engellemek için hazırlanmıştır.

**Tüm AI ajanları ve geliştiriciler bu repoda kod yazarken bu kurallara uymak ZORUNDADIR.**

---

## 1. Sıfır Hardcoded Sır Kuralı (Zero Hardcoded Secrets)

### ❌ Kesin Yasaklar (DON'T)
1. Kod içerisine **asla ve hiçbir koşulda** API anahtarı, gizli anahtar (secret), parola, token, webhook secret veya veritabanı şifresi yazılamaz.
2. Test ve mock dosyaları hariç, `required("KEY", "fallback-secret-123")` veya `process.env.SECRET || "default_pass"` gibi "varsayılan sır" (fallback secret) atamaları yapılamaz.
3. `console.log(token)`, `console.log(session)` veya `logger.info({ token })` şeklinde hassas kimlik bilgileri stdout'a/log'a basılamaz.

### ✅ Doğru Uygulama (DO)
1. Tüm ortam değişkenleri Zod ile doğrulanmış merkezi yapılandırma modülleri (`apps/api/src/infra/config/env.ts` veya `packages/config/src/env.ts`) üzerinden okunmalıdır.
2. Üretim ortamında (`NODE_ENV === "production"`) kritik anahtarların eksik olması durumunda uygulama boot anında (başlarken) `process.exit(1)` ile durmalıdır (fail-fast).

---

## 2. Multi-Tenant İzolasyonu & IDOR / BOLA Savunması

Apartman yönetim sistemlerinde en büyük felaket; A Sitesi yöneticisinin veya sakininin, B Sitesinin aidat, sakin listesi, banka hareketleri veya karar defteri kayıtlarını görmesidir.

### ❌ Tehlikeli Hata: Doğrudan ID ile Sorgulama (IDOR)
```typescript
// KÖTÜ: Başka bir sitenin ID'si girilirse yetkisiz erişim gerçekleşir!
const debt = await db.query.debts.findFirst({
  where: eq(debts.id, inputId),
});
```

### ✅ Zorunlu Kural: Çift Doğrulama (Tenant Scope)
Her zaman aktif oturumun `tenantId` değeri sorguya eklenmelidir:
```typescript
// İYİ: Kullanıcı sadece kendi sitesine ait borç kaydına erişebilir
const debt = await db.query.debts.findFirst({
  where: and(
    eq(debts.id, inputId),
    eq(debts.tenantId, ctx.tenantId)
  ),
});
if (!debt) throw new NotFoundException("Kayıt bulunamadı");
```

### ⚠️ `db.bypass()` Kullanım Disiplini
- `db.bypass()` Postgres RLS (Row Level Security) korumasını devre dışı bırakır.
- Yalnızca platform geneli işlemler (örn: giriş yaparken kullanıcının telefonunu arama, sistem arka plan jobları) için kullanılmalıdır.
- `db.bypass()` çağrısı yapılıyorsa, sorgu sonucunda dönen veriler filtrelenmeli ve **asla başka bir tenant'a ait PII (TCKN, telefon, IBAN) harici kullanıcıya döndürülmemelidir**.

---

## 3. SQL Injection & Drizzle ORM Disiplini

### ❌ Kesin Yasak: Raw SQL String Birleştirme
```typescript
// KÖTÜ: SQL Injection açığı!
await db.execute(sql`SELECT * FROM users WHERE name = '${inputName}'`);
```

### ✅ Doğru Uygulama: Parametreli Drizzle API
Drizzle ORM'in tip güvenli sorgu oluşturucusu veya parametreli `sql` şablonları kullanılmalıdır:
```typescript
// İYİ: Parametreli sorgu
await db.select().from(users).where(eq(users.name, inputName));

// VEYA sql template ile güvenli bağlama:
await db.execute(sql`SELECT * FROM users WHERE name = ${inputName}`);
```

---

## 4. KVKK, PII & Hata Mesajı Hijyeni

### 4.1. Veri Şifreleme (Encryption at Rest)
- TCKN, IBAN ve hassas kişisel veriler veritabanına plaintext (düz metin) yazılamaz.
- `packages/core/src/crypto.ts` içindeki `encryptField(value, masterKey, tenantId)` ve `blindIndex(value, masterKey, tenantId)` fonksiyonları kullanılmalıdır.

### 4.2. Pino Log Redaksiyonu
- Loglara kesinlikle `password`, `tckn`, `iban`, `creditCard`, `token`, `secret`, `apiKey` gibi alanlar ham yazılamaz.
- Pino konfigürasyonundaki `redact` listesi bu alanları otomatik maskelemelidir (`[Redacted]`).

### 4.3. 500 Hata Mesajları Sızıntı Önleme
- İstemciye (tarayıcıya veya API tüketicisine) dönen hata yanıtlarında Postgres tablo adları, SQL sorgu cümleleri, DB bağlantı adresleri veya stacktrace bilgileri **kesinlikle yer alamaz**.
- Hata yanıtı standart ve temiz olmalıdır:
```json
{
  "error": {
    "code": "internal_error",
    "message": "Bir işlem hatası oluştu. Lütfen daha sonra tekrar deneyin."
  }
}
```

---

## 5. Performans, Ölçeklenebilirlik & DoS Önleme

### 5.1. Sınırsız Sayfalama Yasağı (Unbounded Query Prevention)
Bir saldırgan `?pageSize=1000000` göndererek veritabanını ve Node.js belleğini kilitleyebilir:
- Tüm liste uçlarında `pageSize` tavanı **en fazla 100** ile sınırlandırılmalıdır (`Math.min(requestedSize, 100)`).
- Sayfalama parametresi belirtilmemişse varsayılan değer `20` veya `50` olmalıdır.

### 5.2. N+1 Sorgu Problemi
- Döngü (`for`, `map`, `forEach`) içinde veritabanı sorgusu **kesinlikle yapılamaz**.
- Bunun yerine Drizzle ilişkisel sorguları (`with: { resident: true }`) veya `inArray(table.id, ids)` ile toplu (batch) sorgulama yapılmalıdır.

### 5.3. İstek Gövdesi Boyut Limiti (Body Size Limit)
- JSON istek gövdeleri `apps/api/src/main.ts` içinde `limit: "256kb"` ile korunmalıdır.
- Belge yükleme uçlarında dosya tipleri MIME type'ın yanı sıra magic bytes ile doğrulanmalıdır.

---

## 6. Güvenlik ve Performans Kontrol Listesi (Checklist)

Yeni bir uç nokta (endpoint), servis veya bileşen yazarken şu soruları yanıtla:
1. [ ] Bu sorguda `tenantId` filtresi var mı? (Başka bir sitenin verisi gelebilir mi?)
2. [ ] Kullanıcı bu işlem için gereken yetkiye (`@RequirePermission`) sahip mi?
3. [ ] Kullanıcı girdisi doğrudan bir SQL veya komut dizesine dahil edilmiş mi?
4. [ ] Kod içine şifre, token veya geçici test sırrı yazıldı mı?
5. [ ] Loglanan nesnelerde TCKN, telefon, şifre veya token var mı?
6. [ ] Sayfalamada üst sınır (`pageSize <= 100`) konuldu mu?
7. [ ] Döngü içinde veritabanı sorgusu (N+1) var mı?
