/**
 * Bilgi bankası içeriği — kısa, kaynaklı cevaplar. Hukuki danışmanlık değil;
 * her cevap dayandığı maddeyi gösterir ki yönetici asıl metne gidebilsin.
 * Maddeler 634 sayılı Kat Mülkiyeti Kanunu'na (KMK) göre.
 */
export interface KnowledgeLink {
  label: string;
  href: string;
}

export interface KnowledgeItem {
  q: string;
  a: string;
  refs: string[];
  links?: KnowledgeLink[];
}

export const LAW_LINKS: KnowledgeLink[] = [
  {
    label: "634 sayılı Kat Mülkiyeti Kanunu (mevzuat.gov.tr)",
    href: "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=634&MevzuatTur=1&MevzuatTertip=5",
  },
  {
    label: "6698 sayılı Kişisel Verilerin Korunması Kanunu (mevzuat.gov.tr)",
    href: "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5",
  },
  {
    label: "2004 sayılı İcra ve İflas Kanunu (mevzuat.gov.tr)",
    href: "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=2004&MevzuatTur=1&MevzuatTertip=3",
  },
];

export const FAQ: KnowledgeItem[] = [
  {
    q: "Aidattan (ortak giderlerden) kim sorumlu: malik mi, kiracı mı?",
    a: "Ortak giderlere katılma yükümlülüğü kat malikinindir. Bağımsız bölümde oturan kiracı da ortak gider ve avanslardan kat maliki ile birlikte müteselsilen sorumludur; ancak kiracının sorumluluğu ödemekle yükümlü olduğu kira bedeli ile sınırlıdır ve yaptığı ödeme kira borcundan düşülür. Panelde hangi türün kime yazılacağını Borç türleri ekranından, kiracılı dairede aidatın maliğe yazılmasını daire kartındaki “Aidatı maliğe yaz” ile belirleyebilirsiniz.",
    refs: ["KMK md.20", "KMK md.22"],
    links: [{ label: "Borç türleri", href: "/panel/borclar/turler" }],
  },
  {
    q: "Gecikme tazminatı ne kadar olabilir?",
    a: "Gider veya avans payını ödemeyen kat maliki, ödemede geciktiği günler için aylık %5 oranında gecikme tazminatı ödemekle yükümlüdür. Panel bu sınırın üzerinde oran kaydetmenize izin vermez; tür başına daha düşük oran ya da gecikme yok seçilebilir.",
    refs: ["KMK md.20"],
    links: [{ label: "Borç türleri", href: "/panel/borclar/turler" }],
  },
  {
    q: "Borçlu daire satılırsa borç ne olur?",
    a: "Ortak gider borcu, borcun doğduğu dönemdeki kat malikinindir. Kat malikinin ortak gider ve avans borcu için diğer kat malikleri lehine kanuni ipotek hakkı vardır ve tapuya tescili istenebilir. Satıştan önce “borcu yoktur” belgesi istenmesi yaygın uygulamadır; panelden düzenlenebilir.",
    refs: ["KMK md.22"],
    links: [{ label: "Borç durum belgesi", href: "/panel/borcu-yoktur" }],
  },
  {
    q: "Kiracı taşındı, kalan borcunu nasıl takip ederim?",
    a: "Kiracının daireyle ilişkisini bitirdiğinizde (çıkış tarihi) kişi “eski kiracı” olur ve borcu silinmez. Borç listesi, hesap özeti, dönemsel borç tablosu ve tebligat ekranlarındaki “Üye durumu: Eski kiracılar” süzgeci yalnız bu borçları gösterir.",
    refs: [],
    links: [
      { label: "Borçlar (eski kiracılar)", href: "/panel/borclar?uye=eski-kiraci" },
      { label: "Tebligat", href: "/panel/evrak?uye=eski-kiraci" },
    ],
  },
  {
    q: "Genel kurul ne zaman ve nasıl çağrılır?",
    a: "Kat malikleri kurulu yönetim planında belirtilen zamanda, belirtilmemişse yılda bir kez toplanır. Çağrı, toplantı tarihinden en az on beş gün önce, toplantı yeri, günü, saati ve gündemiyle birlikte bütün kat maliklerine imza karşılığı ya da iadeli taahhütlü mektupla yapılır; ilk toplantıda yeter sayı sağlanamazsa yapılacak ikinci toplantı da çağrıda belirtilir.",
    refs: ["KMK md.29"],
    links: [{ label: "Çağrı mektubu ve vekaletname", href: "/panel/evrak/genel-kurul" }],
  },
  {
    q: "Bir kişi kaç kat malikine vekâlet edebilir?",
    a: "Kat malikleri kurulu toplantısında bir kişi, kat malikleri sayısının yüzde beşinden fazlasına vekâlet edemez; kat malikleri sayısı yirmiden az ise bir kişi ancak bir kat malikini temsil edebilir.",
    refs: ["KMK md.31"],
    links: [{ label: "Vekaletname örneği", href: "/panel/evrak/genel-kurul" }],
  },
  {
    q: "Ödemeyen kat malikine karşı yol nedir?",
    a: "Önce yazılı ödeme çağrısı ya da ihtar gönderilir; ödenmezse borç için icra takibi başlatılabilir ya da dava açılabilir. Takibin bir avukat aracılığıyla yürütülmesi önerilir. Panelde ihtar yazısı Hukuki evrak ekranından, icra dosyası ve avukat ataması Hukuk ekranından izlenir.",
    refs: ["KMK md.20", "İİK"],
    links: [
      { label: "Tebligat / ihtarname", href: "/panel/evrak" },
      { label: "İcra dosyaları", href: "/panel/hukuk" },
    ],
  },
  {
    q: "Sakinlerin telefon ve kimlik bilgilerini nasıl korumalıyım?",
    a: "Kişisel veriler yalnız yönetim amacıyla ve gerektiği kadar işlenmelidir. Panel telefonları listelerde maskeli gösterir; açık telefon içeren çıktılar (ör. telefonlu adres etiketi) yalnız yöneticiye açıktır ve denetim kaydına yazılır. Borç bilgisi topluluk kanallarında paylaşılmamalıdır.",
    refs: ["KVKK md.4", "KVKK md.12"],
    links: [{ label: "KVKK ekranı", href: "/panel/kvkk" }],
  },
];

export const TEMPLATES: KnowledgeLink[] = [
  { label: "Ödeme çağrısı / ihtarname (toplu, borç dökümlü)", href: "/panel/evrak" },
  { label: "Genel kurul çağrı mektubu", href: "/panel/evrak/genel-kurul" },
  { label: "Vekaletname örneği", href: "/panel/evrak/genel-kurul" },
  { label: "Antetli serbest yazı (duyuru, resmî yazışma)", href: "/panel/evrak/antetli" },
  { label: "Adres etiketi", href: "/panel/evrak/etiket" },
  { label: "Hazirun cetveli", href: "/panel/toplantilar" },
];
