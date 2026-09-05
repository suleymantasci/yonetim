---
name: design-tokens-enforcer
description: Projedeki katı semantik tasarım token kurallarını (tests/design-tokens.test.ts) koruyan; dark: varyantını, ham Tailwind renklerini ve sabit hex kodlarını kesin olarak engelleyen mimari uyum skilli.
---

# Semantik Tasarım Tokenları & Mimari Uyum Kılavuzu

Bu beceri (skill), repodaki `tests/design-tokens.test.ts` testinin makine tarafından denetlediği katı mimari kuralları AI ajanına öğretir. Bu kuralların **tek bir tanesinin bile ihlal edilmesi testlerin patlamasına (`pnpm test` failure) yol açar.**

---

## 1. Kesin Olarak Yasaklanan 3 Sözdizimi Kuralı

### ❌ KURAL 1: Hiçbir Dosyada `dark:` Varyantı Kullanılamaz
- **Yasak:** `dark:bg-slate-900`, `dark:text-white`, `dark:border-gray-800`
- **Neden:** Projede tema yönetimi çift CSS değişkeni (`--t-*`) kümesi ile yapılır. HTML köküne `<html data-theme="dark">` niteliği yazıldığında tüm tokenlar CSS seviyesinde otomatik olarak koyu temaya geçer. `dark:` yazmak gereksiz kod tekrarı yaratır ve mimariyi bozar.

### ❌ KURAL 2: Ham Tailwind Renk Paleti Kullanılamaz
- **Yasak:** `slate-*`, `gray-*`, `zinc-*`, `neutral-*`, `stone-*`, `red-*`, `orange-*`, `amber-*`, `yellow-*`, `green-*`, `emerald-*`, `teal-*`, `cyan-*`, `blue-*`, `indigo-*`, `violet-*`, `purple-*` vb. (Örn: `bg-slate-50`, `text-blue-600`, `border-gray-200`).
- **Neden:** Ham renkler temaya duyarsızdır; açık temada çalışan bir `bg-slate-100`, koyu temada kör noktaya dönüşür.

### ❌ KURAL 3: Bileşenlerde Sabit Hex veya RGB Renk Kullanılamaz
- **Yasak:** `#ffffff`, `#0f172a`, `rgb(...)`, `rgba(...)`, `hsl(...)`
- **İstisna:** Sadece `apps/app/src/app/global-error.tsx` (stil dosyası çökerse diye) ve e-posta şablonları muaf tutulmuştur. Bunun dışındaki tüm dosyalarda hex kod testi kırar.

---

## 2. Kullanılması Zorunlu Semantik Token Eşleme Tablosu

Tüm bileşenler ve sayfalar yalnızca aşağıdaki semantik rolleri kullanmalıdır:

### 2.1. Yüzeyler (Surfaces & Backgrounds)
| Semantik Sınıf | Kullanım Amacı |
|---|---|
| `bg-canvas` | Sayfanın en alt taban zemini (arka plan). |
| `bg-surface` | Standart kartlar, paneller, tablolar, form zeminleri. |
| `bg-surface-raised` | Havada duran öğeler: Dropdown menüler, modallar, tooltipler. |
| `bg-surface-sunken` | Çukurda duran öğeler: Arama çubukları, pasif girdi zeminleri, tablo `thead`. |
| `bg-overlay` | Modal veya drawer arkasındaki karartma perdesi. |

### 2.2. Metinler (Typography & Foregrounds)
| Semantik Sınıf | Kullanım Amacı |
|---|---|
| `text-fg` | Birincil metin, ana başlıklar, yüksek kontrastlı içerik. |
| `text-fg-muted` | İkincil metin, açıklamalar, alt başlıklar, etiketler. |
| `text-fg-subtle` | Pasif metinler, ayraçlar (`/`), yer tutucular (placeholder). |
| `text-fg-inverted` | Koyu zemin üstüne beyaz veya zıt metin. |

### 2.3. Kenarlıklar ve Bölücüler (Borders)
| Semantik Sınıf | Kullanım Amacı |
|---|---|
| `border-border` | Standart kart, tablo ve bileşen kenarlığı (1px subtle). |
| `border-border-strong` | Odaklanılmış elemanlar, hover durumları, aktif sekmeler. |
| `divide-border` | Liste veya tablo satır ayraçları. |

### 2.4. Marka ve Aksiyon (Brand & Action)
| Semantik Sınıf | Kullanım Amacı |
|---|---|
| `bg-primary` / `text-primary-fg` | Birincil aksiyon butonu, aktif sekme, ilerleme çubuğu. |
| `bg-accent` / `text-accent-fg` | Dikkat çekici vurgu rozeti veya ikincil çağrı. |
| `ring-primary` / `ring-offset-canvas` | Klavye odak halkası (focus ring). |

### 2.5. Durumlar (Status: Başarı, Hata, Uyarı, Bilgi)
Her durum 3'lü uyumlu renk paketiyle gelir:

| Durum | Zemin Sınıfı | Metin Sınıfı | Kenarlık Sınıfı |
|---|---|---|---|
| **Başarı (Success)** | `bg-success-soft` | `text-success-fg` | `border-success-border` |
| **Tehlike (Danger)** | `bg-danger-soft` | `text-danger-fg` | `border-danger-border` |
| **Uyarı (Warning)** | `bg-warning-soft` | `text-warning-fg` | `border-warning-border` |
| **Bilgi (Info)** | `bg-info-soft` | `text-info-fg` | `border-info-border` |

---

## 3. Pratik Dönüşüm Örnekleri

### ❌ Yanlış Kod:
```tsx
// BU KOD TESTİ KIRAR VE ÇALIŞMAZ!
<div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-800 p-4 rounded-lg shadow">
  <h4 className="text-gray-900 dark:text-white font-bold">Daire 14</h4>
  <p className="text-gray-500 text-sm">Aidat Borcu</p>
  <span className="text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded">
    Gecikmiş
  </span>
</div>
```

### ✅ Doğru Kod:
```tsx
// MİMARİYE %100 UYGUN VE TESTLERİ GEÇEN KOD
<div className="bg-surface border border-border p-4 rounded-lg">
  <h4 className="text-fg font-semibold">Daire 14</h4>
  <p className="text-fg-muted text-sm">Aidat Borcu</p>
  <span className="inline-flex items-center text-xs font-medium text-danger-fg bg-danger-soft border border-danger-border px-2 py-0.5 rounded">
    Gecikmiş
  </span>
</div>
```

---

## Özet Kural
Kod yazarken parmağın `dark:`, `slate-`, `blue-` veya `#` tuşlarına gittiği anda dur!
Hemen semantik karşılığını (`bg-surface`, `text-fg`, `bg-primary`, `border-border`) kullan.
