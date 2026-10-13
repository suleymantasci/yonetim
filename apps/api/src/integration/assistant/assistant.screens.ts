import type { Permission } from "@yonetim/core";

/**
 * Asistanın "hangi ekran / nerede" cevapları — menüyle (`apps/app/src/components/shell/nav.ts`)
 * aynı izin ve kitle kuralları. Dijital Asistan soruyu aksansız küçük harfe
 * çevirip bu anahtar kelimelerle eşliyor (Türkçe ekler tanınır).
 */
export interface AssistantScreen {
  id: string;
  title: string;
  href: string;
  description: string;
  keywords: string[];
  permission: Permission;
  audience: Array<"staff" | "resident">;
}

const R: AssistantScreen["audience"] = ["resident"];
const S: AssistantScreen["audience"] = ["staff"];
const B: AssistantScreen["audience"] = ["staff", "resident"];

export const ASSISTANT_SCREENS: AssistantScreen[] = [
  // Sakin
  { id: "my-debts", title: "Borçlarım", href: "/panel/borclarim", description: "Aidat ve diğer borçlarınızın dökümü, vadeleri ve gecikme bedelleri.", keywords: ["borc", "borcum", "borclarim", "aidat", "aidatim", "gecikme", "vade", "odeme"], permission: "debt:read_own", audience: R },
  { id: "my-payments", title: "Ödemelerim", href: "/panel/odemelerim", description: "Yaptığınız ödemeler ve makbuzlar.", keywords: ["odeme", "odemelerim", "makbuz", "dekont", "tahsilat", "odedim"], permission: "payment:read_own", audience: R },
  { id: "my-requests", title: "Taleplerim", href: "/panel/taleplerim", description: "Arıza, şikâyet ve öneri talepleriniz.", keywords: ["talep", "taleplerim", "ariza", "sikayet", "oneri", "bildirim"], permission: "request:read_own", audience: R },
  { id: "my-messages", title: "Mesajlarım", href: "/panel/mesajlarim", description: "Yönetimle yazışmalarınız.", keywords: ["mesaj", "mesajlarim", "yazisma", "iletisim"], permission: "message:read_own", audience: R },
  { id: "my-votes", title: "Oylamalarım", href: "/panel/oylamalarim", description: "Açık anket ve oylamalar.", keywords: ["oylama", "anket", "oy", "oylamalarim"], permission: "poll:vote", audience: R },
  { id: "my-info", title: "Bilgilerim", href: "/panel/bilgilerim", description: "Bağımsız bölüm, iletişim ve hane bilgileriniz.", keywords: ["bilgilerim", "telefon", "profil", "daire", "hane", "arac", "plaka"], permission: "unit:read", audience: R },
  { id: "management-info", title: "Yönetim bilgileri", href: "/panel/yonetim-bilgileri", description: "Yönetici, banka hesabı ve iletişim bilgileri.", keywords: ["yonetici", "iban", "banka", "hesap", "yonetim"], permission: "tenant:read", audience: R },
  { id: "announcements", title: "Duyurular", href: "/panel/duyurular", description: "Site duyuruları.", keywords: ["duyuru", "duyurular", "haber"], permission: "announcement:read", audience: B },
  // Yönetim
  { id: "units", title: "Bağımsız bölümler", href: "/panel/birimler", description: "Daire, dükkân ve blok tanımları.", keywords: ["daire", "birim", "blok", "bolum", "dukkan"], permission: "unit:read", audience: S },
  { id: "residents", title: "Sakinler", href: "/panel/sakinler", description: "Malik ve kiracı kayıtları, davetler.", keywords: ["sakin", "sakinler", "malik", "kiraci", "davet", "uye"], permission: "resident:read", audience: S },
  { id: "dues", title: "Aidat planları", href: "/panel/aidat", description: "Aidat tutarları ve dönemsel borçlandırma.", keywords: ["aidat", "plan", "tutar", "borclandirma"], permission: "dues:read", audience: S },
  { id: "debts", title: "Borçlar", href: "/panel/borclar", description: "Borç listesi, tahsilat ve toplu borçlandırma.", keywords: ["borc", "borclar", "tahsilat", "toplu", "gecikme", "odeme"], permission: "debt:read", audience: S },
  { id: "certificate", title: "Borcu yoktur belgesi", href: "/panel/borcu-yoktur", description: "Borcu yoktur yazısı düzenleme.", keywords: ["belge", "borcu", "yoktur", "yazi"], permission: "debt:read", audience: S },
  { id: "expenses", title: "Giderler", href: "/panel/giderler", description: "Gider kayıtları ve kategorileri.", keywords: ["gider", "giderler", "fatura", "harcama", "masraf"], permission: "expense:read", audience: S },
  { id: "vendors", title: "Tedarikçiler", href: "/panel/tedarikciler", description: "Tedarikçi cari hesapları.", keywords: ["tedarikci", "firma", "cari"], permission: "vendor:read", audience: S },
  { id: "bank", title: "Banka", href: "/panel/banka", description: "Banka hesapları, ekstre aktarma ve eşleştirme.", keywords: ["banka", "ekstre", "eslestirme", "hesap", "havale"], permission: "bank:read", audience: S },
  { id: "cash", title: "Kasa", href: "/panel/kasa", description: "Kasa hareketleri ve devir.", keywords: ["kasa", "nakit", "devir"], permission: "bank:read", audience: S },
  { id: "budget", title: "Bütçe", href: "/panel/butce", description: "İşletme bütçesi.", keywords: ["butce", "isletme", "projesi"], permission: "report:read", audience: S },
  { id: "meetings", title: "Toplantılar", href: "/panel/toplantilar", description: "Genel kurul, hazirun ve vekâlet.", keywords: ["toplanti", "kurul", "hazirun", "vekalet", "genel"], permission: "meeting:read", audience: S },
  { id: "requests", title: "Talepler", href: "/panel/talepler", description: "Sakin talepleri ve iş takibi.", keywords: ["talep", "talepler", "ariza", "sikayet"], permission: "request:read", audience: S },
  { id: "messages", title: "Mesajlar", href: "/panel/mesajlar", description: "Sakinlerle yazışmalar.", keywords: ["mesaj", "mesajlar"], permission: "message:read", audience: S },
  { id: "bulk-notice", title: "Toplu bildirim", href: "/panel/bildirim", description: "SMS, e-posta ve uygulama bildirimi gönderme.", keywords: ["bildirim", "sms", "eposta", "toplu", "gonder"], permission: "announcement:write", audience: S },
  { id: "maintenance", title: "Bakım", href: "/panel/bakim", description: "Periyodik bakım kayıtları.", keywords: ["bakim", "asansor", "periyodik"], permission: "maintenance:read", audience: S },
  { id: "meters", title: "Sayaçlar", href: "/panel/sayaclar", description: "Su, ısı ve doğalgaz sayaç okumaları.", keywords: ["sayac", "okuma", "su", "isi", "dogalgaz", "kalorimetre"], permission: "meter:read", audience: S },
  { id: "staff", title: "Personel", href: "/panel/personel", description: "Personel kayıtları, maaş ve avans.", keywords: ["personel", "maas", "avans", "kapici", "gorevli"], permission: "staff:read", audience: S },
  { id: "decision-book", title: "Karar defteri", href: "/panel/karar-defteri", description: "Yönetim kararları.", keywords: ["karar", "defter", "defteri"], permission: "decision:read", audience: S },
  { id: "reports", title: "Raporlar", href: "/panel/raporlar", description: "Gelir-gider, bilanço ve diğer raporlar.", keywords: ["rapor", "raporlar", "bilanco", "gelir", "faaliyet"], permission: "report:read", audience: S },
  { id: "accounting", title: "Muhasebe", href: "/panel/muhasebe", description: "Mizan, yevmiye ve açılış fişi.", keywords: ["muhasebe", "mizan", "yevmiye", "kebir", "acilis"], permission: "report:read", audience: S },
  { id: "settings", title: "Ayarlar", href: "/panel/ayarlar", description: "Site, kullanıcı ve tahsilat ayarları.", keywords: ["ayar", "ayarlar", "kullanici", "yetki"], permission: "settings:read", audience: S },
];
