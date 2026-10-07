/**
 * Demo verisinin sabit katalogu — adlar, firmalar, metinler.
 *
 * Kurgusal: gerçek kişi, gerçek firma ya da gerçek adres yok. Firma adları
 * genel meslek adlarından türetilmiş ("Kuzey Asansör"), vergi numaraları
 * ve IBAN'lar biçim olarak geçerli ama hiçbir hesaba karşılık gelmiyor.
 */

export const FIRST_NAMES = [
  "Ahmet", "Mehmet", "Ayşe", "Fatma", "Mustafa", "Emine", "Ali", "Hatice", "Hüseyin", "Zeynep",
  "Hasan", "Elif", "İbrahim", "Meryem", "Murat", "Selin", "Ömer", "Esra", "Yusuf", "Merve",
  "Burak", "Derya", "Emre", "Gizem", "Kemal", "Sevgi", "Can", "Deniz", "Serkan", "Nur",
  "Cem", "Pınar", "Oğuz", "Tuba", "Volkan", "Ebru", "Tolga", "Gül", "Kaan", "Aslı",
  "Barış", "Burcu", "Erdem", "Ceren", "Levent", "Dilek", "Onur", "Sibel", "Uğur", "Yasemin",
] as const;

export const LAST_NAMES = [
  "Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir",
  "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Özkan", "Şimşek",
  "Polat", "Korkmaz", "Erdoğan", "Güneş", "Aksoy", "Tekin", "Bulut", "Ünal", "Turan", "Güler",
  "Bozkurt", "Karaca", "Sarı", "Taş", "Uçar", "Ateş", "Akın", "Er", "Işık", "Sevim",
] as const;

export interface VendorSpec {
  key: string;
  category: string;
  name: string;
  contactName: string;
  taxOffice: string;
}

export const VENDORS: readonly VendorSpec[] = [
  { key: "lift", category: "Asansör bakım", name: "Kuzey Asansör Bakım Ltd.", contactName: "Serdar Usta", taxOffice: "Kadıköy" },
  { key: "clean", category: "Temizlik", name: "Parıltı Temizlik Hizmetleri", contactName: "Nihal Aksu", taxOffice: "Üsküdar" },
  { key: "garden", category: "Peyzaj", name: "Yeşil Dokunuş Peyzaj", contactName: "Rıza Çam", taxOffice: "Ataşehir" },
  { key: "electric", category: "Elektrik", name: "Volt Elektrik Taahhüt", contactName: "Okan Tel", taxOffice: "Kartal" },
  { key: "insurance", category: "Sigorta", name: "Güvence Sigorta Aracılık", contactName: "Melis Ön", taxOffice: "Beşiktaş" },
  { key: "water", category: "Su deposu / tesisat", name: "Berrak Su Teknik", contactName: "Hakan Su", taxOffice: "Maltepe" },
  { key: "fire", category: "Yangın güvenliği", name: "Alev Güvenlik Sistemleri", contactName: "Tarık Ateşli", taxOffice: "Pendik" },
];

export interface CategorySpec {
  key: string;
  name: string;
  icon: string;
  /** Aylık tipik tutar (TL) — 0: aylık değil. */
  monthlyTl: number;
  vendor?: string;
  vatRate: string;
}

export const EXPENSE_CATEGORIES: readonly CategorySpec[] = [
  { key: "electricity", name: "Ortak alan elektriği", icon: "zap", monthlyTl: 6_800, vatRate: "0.20" },
  { key: "water", name: "Ortak alan suyu", icon: "droplet", monthlyTl: 2_400, vatRate: "0.10" },
  { key: "lift", name: "Asansör bakımı", icon: "arrow-up-down", monthlyTl: 4_500, vendor: "lift", vatRate: "0.20" },
  { key: "cleaning", name: "Temizlik hizmeti", icon: "sparkles", monthlyTl: 9_500, vendor: "clean", vatRate: "0.20" },
  { key: "garden", name: "Bahçe ve peyzaj", icon: "trees", monthlyTl: 3_200, vendor: "garden", vatRate: "0.20" },
  { key: "repair", name: "Onarım ve tadilat", icon: "wrench", monthlyTl: 0, vendor: "electric", vatRate: "0.20" },
  { key: "insurance", name: "Sigorta", icon: "shield", monthlyTl: 0, vendor: "insurance", vatRate: "0.00" },
  { key: "supplies", name: "Sarf malzeme ve kırtasiye", icon: "package", monthlyTl: 750, vatRate: "0.20" },
  { key: "bank", name: "Banka masrafları", icon: "landmark", monthlyTl: 120, vatRate: "0.00" },
];

export interface RequestSpec {
  category: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "normal" | "low";
}

export const REQUESTS: readonly RequestSpec[] = [
  { category: "asansor", title: "Asansör 3. katta duruyor, kapı açılmıyor", description: "Sabah 08:15'te asansör 3. katta kaldı, içeride kimse yok ama kapı kapanmıyor.", priority: "critical" },
  { category: "su", title: "Otopark tavanından su sızıyor", description: "B blok otopark girişinde tavandan damlama var, zemin kaygan.", priority: "high" },
  { category: "elektrik", title: "Merdiven otomatiği çalışmıyor", description: "4. ve 5. kat arasında merdiven lambaları yanmıyor.", priority: "normal" },
  { category: "ortak_alan", title: "Çocuk parkındaki salıncak zinciri kopmuş", description: "Sağdaki salıncağın zinciri kopuk, çocuklar için tehlikeli.", priority: "high" },
  { category: "temizlik", title: "Çöp konteyneri taşıyor", description: "Hafta sonu toplanmamış, koku yapıyor.", priority: "normal" },
  { category: "guvenlik", title: "Bahçe kapısı otomatik kapanmıyor", description: "Yaya kapısının pompası zayıflamış, kapı açık kalıyor.", priority: "normal" },
  { category: "dogalgaz", title: "Kazan dairesinde gaz kokusu", description: "Kazan dairesinin önünden geçerken hafif gaz kokusu alındı.", priority: "critical" },
  { category: "hasere", title: "Bodrum katta fare görüldü", description: "Depolarda fare izleri var, ilaçlama talep ediyoruz.", priority: "normal" },
  { category: "su", title: "Su basıncı akşamları düşüyor", description: "Üst katlarda 19:00 sonrası su çok zayıf akıyor; hidrofor kontrol edilmeli.", priority: "high" },
  { category: "ortak_alan", title: "Giriş holündeki seramik kırık", description: "A blok girişinde iki seramik kırık, takılma riski var.", priority: "low" },
  { category: "elektrik", title: "Otopark aydınlatması yetersiz", description: "Otoparkın arka bölümünde üç armatür yanmıyor.", priority: "normal" },
  { category: "diger", title: "İnterkom görüntü vermiyor", description: "Dairedeki interkom ses veriyor ama kamera görüntüsü gelmiyor.", priority: "low" },
  { category: "temizlik", title: "Merdiven temizliği aksadı", description: "Son iki haftadır C blok merdivenleri silinmemiş.", priority: "low" },
  { category: "asansor", title: "Asansörde anormal ses", description: "Asansör hareket ederken metal sürtünme sesi geliyor.", priority: "high" },
  { category: "guvenlik", title: "Güvenlik kamerası kaydı istendi", description: "Otoparkta aracıma çizik atıldı, dün geceye ait kamera kaydına bakılabilir mi?", priority: "normal" },
  { category: "diger", title: "Komşu gürültü şikâyeti", description: "Üst kattan gece 01:00 sonrası yüksek müzik sesi geliyor.", priority: "low" },
];

export const REQUEST_COMMENTS = [
  "Talebiniz alındı, teknik ekibe iletildi.",
  "Firma yarın 10:00'da gelecek.",
  "Parça siparişi verildi, 3 gün içinde değişecek.",
  "İş tamamlandı, kontrol eder misiniz?",
  "Teşekkürler, sorun çözüldü.",
  "Bugün tekrar kontrol edildi, sorun devam etmiyor.",
] as const;

export interface MaintenanceSpec {
  templateCode: string;
  label: string;
  location: string;
  vendor?: string;
  /** Son yapılıştan bu yana geçen gün — vadesi geçmiş/yaklaşan karışımı üretir. */
  lastDoneDaysAgo: number;
  costTl: number;
}

export const MAINTENANCE: readonly MaintenanceSpec[] = [
  { templateCode: "asansor_aylik", label: "Asansör aylık periyodik bakım", location: "Tüm bloklar", vendor: "lift", lastDoneDaysAgo: 24, costTl: 4_500 },
  { templateCode: "asansor_yillik_muayene", label: "Asansör yıllık muayene (A sınıfı etiket)", location: "Tüm bloklar", vendor: "lift", lastDoneDaysAgo: 340, costTl: 3_800 },
  { templateCode: "yangin_tup_kontrol", label: "Yangın söndürücü kontrolü", location: "Kat holleri ve otopark", vendor: "fire", lastDoneDaysAgo: 190, costTl: 2_100 },
  { templateCode: "su_deposu_temizlik", label: "Su deposu temizliği ve dezenfeksiyon", location: "Bodrum kat", vendor: "water", lastDoneDaysAgo: 172, costTl: 6_500 },
  { templateCode: "hidrofor_bakim", label: "Hidrofor bakımı", location: "Bodrum kat", vendor: "water", lastDoneDaysAgo: 95, costTl: 2_750 },
  { templateCode: "elektrik_pano", label: "Elektrik panosu ve topraklama kontrolü", location: "Elektrik odası", vendor: "electric", lastDoneDaysAgo: 300, costTl: 3_300 },
  { templateCode: "paratoner", label: "Paratoner kontrolü", location: "Çatı", vendor: "electric", lastDoneDaysAgo: 372, costTl: 2_400 },
  { templateCode: "sigorta_dask", label: "DASK ve bina sigortası yenileme", location: "Yönetim", vendor: "insurance", lastDoneDaysAgo: 350, costTl: 18_500 },
  { templateCode: "haşere_ilaclama", label: "Ortak alan ilaçlaması", location: "Bodrum ve bahçe", lastDoneDaysAgo: 80, costTl: 1_900 },
  { templateCode: "peyzaj_budama", label: "Ağaç budama ve peyzaj düzenleme", location: "Bahçe", vendor: "garden", lastDoneDaysAgo: 150, costTl: 5_200 },
];

export const ANNOUNCEMENTS = [
  { title: "Su kesintisi — Perşembe 10:00-14:00", body: "İSKİ'nin ana hat çalışması nedeniyle Perşembe günü 10:00-14:00 arasında su kesintisi olacaktır. Lütfen ihtiyacınız kadar su biriktiriniz.", urgent: true, daysAgo: 2 },
  { title: "Olağan genel kurul toplantısı", body: "Yıllık olağan kat malikleri kurulu toplantımız ayın son Cumartesi günü saat 14:00'te toplantı salonunda yapılacaktır. Gündem ve vekâlet formu ektedir.", urgent: false, daysAgo: 9 },
  { title: "Asansör bakımı tamamlandı", body: "A ve B blok asansörlerinin aylık bakımı tamamlanmıştır. Anlayışınız için teşekkür ederiz.", urgent: false, daysAgo: 23 },
  { title: "Aidat ödemelerinde yeni dönem", body: "Bu aydan itibaren aidatlarınızı panelden kartla ya da site hesabımıza havale ile ödeyebilirsiniz. Açıklamaya blok ve daire numaranızı yazmayı unutmayınız.", urgent: false, daysAgo: 41 },
  { title: "Bahçe ilaçlaması", body: "Cumartesi sabahı bahçe ve bodrum katlarda ilaçlama yapılacaktır. Evcil hayvanlarınızı bahçeye çıkarmamanızı rica ederiz.", urgent: false, daysAgo: 64 },
] as const;

export const PARCEL_CARRIERS = ["Yurtiçi Kargo", "Aras Kargo", "MNG Kargo", "PTT Kargo", "Trendyol Express", "Hepsijet"] as const;

export const VISIT_PURPOSES = ["Misafir", "Teknik servis", "Kurye", "Nakliye", "Emlakçı", "Temizlik görevlisi"] as const;
