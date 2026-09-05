# Design System

<!-- impeccable:design-schema 1 -->

## Visual Direction & Philosophy

- **Karakter:** "Bank & Operating System" ciddiyeti. Linear, Mercury ve Stripe'ın editoryal tasarım kalitesi.
- **Hafiflik & Hassasiyet:** Kalın gölgeler ve kaba kartlar yerine 1px saç teli (`gap-px bg-border`, `border-border`) ayrıcılar ve zengin zemin hiyerarşisi (`bg-canvas`, `bg-surface`, `bg-surface-sunken`).
- **Anti-AI-Slop Garantisi:** Mor-mavi metin degrade yok, 3D killi anlamsız ikonlar yok, kart içinde kart yuvalama yok, gereksiz animasyon sıçramaları (bounce) yok.
- **Güven Mimarisi:** Finansal verilerde `tabular-nums`, açık/gecikmiş borçlarda net ama göz yormayan semantik durum rozetleri (`bg-success-soft`, `bg-warning-soft`).

## Palette & Semantic Colors

- **Kimlik (Brand Ink):** `#0b3a66` (Koyu lacivert kimlik bandı, başlıklar, footer).
- **Eylem (Brand Primary):** `#2563eb` (Birincil butonlar, aktif sekmeler, etkileşimli bağlantılar).
- **Zeminler (Surfaces):**
  - Canvas: `#f8fafc` (Sayfa ana zemini)
  - Surface: `#ffffff` (Yükseltilmiş kart ve etkileşimli alanlar)
  - Sunken: `#f1f5f9` (İkincil/gömülü bilgi şeritleri)
- **Metin (Foreground):**
  - Ana Metin: `#0f172a` (Yüksek kontrast, WCAG AAA)
  - İkincil: `#475569` (Açıklamalar ve yardımcı metinler)
  - Alt/Künye: `#64748b` (Zaman damgaları, etiketler)
- **Ayrıcılar (Borders):**
  - Standart: `#e2e8f0` (1px saç teli çizgiler)
  - Güçlü: `#7d8da2` (Form alanları ve odak sınırları)

## Typography

- **Heading:** `font-heading` (`font-extrabold tracking-tight leading-[1.08]`).
- **Body:** `font-sans` (`text-base sm:text-lg leading-relaxed`).
- **Rakamlar & Veri:** `tabular-nums font-mono` veya `font-heading font-bold tabular-nums`.

## Motion & Micro-Interactions

- **Süreler:** Hızlı geçişler `120ms - 200ms`, yumuşak `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Buton Hissi:** Tıklamada `active:scale-[0.98]` dokunsal geri bildirim.
- **Kart/Hover:** `transition-all duration-200 hover:border-primary/40 hover:shadow-md`.
- **Giriş Animasyonları:** `y: 12 -> 0`, `opacity: 0 -> 1` hafif ve ölçülü girişler (`Reveal`, `Stagger`).
