/**
 * Periyodik bakım kütüphanesi — SPEC Bölüm 3.7 (50+ bakım tipi).
 * `regulatoryRef` alanı yasal dayanağı belirtir; zorunlu olanlar isMandatory=true.
 */
export interface MaintenanceTemplateSeed {
  code: string;
  equipmentType: string;
  name: string;
  intervalDays: number;
  regulatoryRef: string | null;
  isMandatory: boolean;
  checklist: string[];
}

export const MAINTENANCE_TEMPLATE_SEED: MaintenanceTemplateSeed[] = [
  // --- Asansör ---
  { code: "asansor_aylik", equipmentType: "asansor", name: "Asansör aylık bakım", intervalDays: 30, regulatoryRef: "Asansör İşletme ve Bakım Yönetmeliği md.7 (aylık bakım zorunlu)", isMandatory: true, checklist: ["Kabin ve kapı kontrolü", "Fren testi", "Acil durum butonu ve telefonu", "Yağlama", "Kumanda panosu"] },
  { code: "asansor_yillik_muayene", equipmentType: "asansor", name: "Asansör yıllık periyodik kontrol (A tipi muayene)", intervalDays: 365, regulatoryRef: "Asansör Periyodik Kontrol Yönetmeliği — yıllık A tipi muayene kuruluşu kontrolü", isMandatory: true, checklist: ["Muayene kuruluşu randevusu", "Etiket renginin kontrolü (yeşil/mavi/sarı/kırmızı)", "Rapor arşivleme"] },
  { code: "asansor_kurtarma_egitim", equipmentType: "asansor", name: "Asansörde mahsur kalma kurtarma tatbikatı", intervalDays: 365, regulatoryRef: null, isMandatory: false, checklist: ["Görevli personel eğitimi", "Kurtarma anahtarı kontrolü"] },

  // --- Yangın güvenliği ---
  { code: "yangin_tup_dolum", equipmentType: "yangin_sondurucu", name: "Yangın söndürücü dolum", intervalDays: 1460, regulatoryRef: "Binaların Yangından Korunması Hakkında Yönetmelik md.99 (4 yılda bir dolum)", isMandatory: true, checklist: ["Dolum tarihi etiketi", "Basınç göstergesi", "Hortum ve pim kontrolü"] },
  { code: "yangin_tup_kontrol", equipmentType: "yangin_sondurucu", name: "Yangın söndürücü periyodik kontrol", intervalDays: 180, regulatoryRef: "Binaların Yangından Korunması Hakkında Yönetmelik md.99 (6 ayda bir kontrol)", isMandatory: true, checklist: ["Yerinde mi", "Mühür sağlam mı", "Erişim engeli var mı"] },
  { code: "yangin_dolabi", equipmentType: "yangin_dolabi", name: "Yangın dolabı ve hortum kontrolü", intervalDays: 180, regulatoryRef: "Binaların Yangından Korunması Hakkında Yönetmelik", isMandatory: true, checklist: ["Hortum basınç testi", "Nozzle kontrolü", "Dolap kilidi"] },
  { code: "yangin_algilama", equipmentType: "yangin_algilama", name: "Yangın algılama ve alarm sistemi testi", intervalDays: 180, regulatoryRef: "Binaların Yangından Korunması Hakkında Yönetmelik md.96", isMandatory: true, checklist: ["Duman dedektörü testi", "Siren testi", "Panel arıza kaydı", "Yedek akü"] },
  { code: "yangin_pompa", equipmentType: "yangin_pompasi", name: "Yangın pompası çalıştırma testi", intervalDays: 30, regulatoryRef: null, isMandatory: false, checklist: ["Otomatik devreye girme", "Basınç değeri", "Jokey pompa"] },
  { code: "acil_aydinlatma", equipmentType: "acil_aydinlatma", name: "Acil aydınlatma ve yönlendirme testi", intervalDays: 90, regulatoryRef: "Binaların Yangından Korunması Hakkında Yönetmelik md.72", isMandatory: true, checklist: ["Batarya süresi testi", "Armatür kontrolü"] },
  { code: "yangin_tahliye_plani", equipmentType: "yangin_tahliye", name: "Tahliye planı ve tatbikatı", intervalDays: 365, regulatoryRef: "Binaların Yangından Korunması Hakkında Yönetmelik md.129", isMandatory: false, checklist: ["Kat planları güncel mi", "Toplanma alanı", "Tatbikat tutanağı"] },

  // --- Isıtma / doğalgaz ---
  { code: "kazan_yillik", equipmentType: "kazan", name: "Merkezi kazan yıllık bakım", intervalDays: 365, regulatoryRef: "Binalarda Enerji Performansı Yönetmeliği", isMandatory: true, checklist: ["Brülör ayarı", "Baca gazı analizi", "Emniyet ventili", "Su seviyesi"] },
  { code: "baca_temizlik", equipmentType: "baca", name: "Baca temizliği ve kontrolü", intervalDays: 365, regulatoryRef: "Binaların Yangından Korunması Hakkında Yönetmelik md.58 (yılda en az bir kez)", isMandatory: true, checklist: ["Kurum temizliği", "Baca çekiş testi", "Karbonmonoksit riski"] },
  { code: "dogalgaz_tesisat", equipmentType: "dogalgaz", name: "Doğalgaz iç tesisat kontrolü", intervalDays: 730, regulatoryRef: "Doğal gaz dağıtım şirketi teknik şartnamesi", isMandatory: true, checklist: ["Kaçak testi", "Vana kontrolü", "Havalandırma menfezleri"] },
  { code: "kalorifer_petek", equipmentType: "isitma", name: "Kalorifer tesisatı ve petek havası alma", intervalDays: 365, regulatoryRef: null, isMandatory: false, checklist: ["Sistem basıncı", "Hava alma", "Vana sızdırmazlık"] },
  { code: "isi_pay_olcer", equipmentType: "isi_payolcer", name: "Isı pay ölçer okuma ve kalibrasyon", intervalDays: 365, regulatoryRef: "Merkezi Isıtma Gider Paylaşım Yönetmeliği", isMandatory: true, checklist: ["Okuma dökümü", "Arızalı ölçer tespiti", "Paylaşım raporu"] },

  // --- Su / hidrofor ---
  { code: "hidrofor_bakim", equipmentType: "hidrofor", name: "Hidrofor bakımı", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Membran kontrolü", "Basınç şalteri", "Pompa yatakları", "Kaçak kontrolü"] },
  { code: "su_deposu_temizlik", equipmentType: "su_deposu", name: "Su deposu temizliği ve dezenfeksiyon", intervalDays: 180, regulatoryRef: "İnsani Tüketim Amaçlı Sular Hakkında Yönetmelik", isMandatory: true, checklist: ["Boşaltma ve fırçalama", "Klorlama", "Kapak sızdırmazlık", "Analiz numunesi"] },
  { code: "su_analizi", equipmentType: "su_deposu", name: "Su numunesi laboratuvar analizi", intervalDays: 365, regulatoryRef: "İnsani Tüketim Amaçlı Sular Hakkında Yönetmelik", isMandatory: true, checklist: ["Numune alma", "Laboratuvar raporu", "Sonuç arşivi"] },
  { code: "pissu_tesisat", equipmentType: "pissu", name: "Pissu ve rögar temizliği", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Rögar açma", "Kanal temizliği", "Koku sifonu"] },
  { code: "yagmur_olugu", equipmentType: "cati", name: "Yağmur oluğu ve dere temizliği", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Yaprak/atık temizliği", "İniş borusu akış testi"] },

  // --- Elektrik ---
  { code: "elektrik_pano", equipmentType: "elektrik_pano", name: "Elektrik panosu termal kontrol", intervalDays: 365, regulatoryRef: "Elektrik Tesislerinde Topraklamalar Yönetmeliği", isMandatory: true, checklist: ["Termal kamera ölçümü", "Sıkma kontrolü", "Etiketleme"] },
  { code: "topraklama_olcum", equipmentType: "topraklama", name: "Topraklama ölçümü", intervalDays: 365, regulatoryRef: "Elektrik Tesislerinde Topraklamalar Yönetmeliği md.10 (yılda bir)", isMandatory: true, checklist: ["Direnç ölçümü", "Ölçüm raporu", "Eksik bağlantı"] },
  { code: "paratoner", equipmentType: "paratoner", name: "Paratoner (yıldırımdan korunma) kontrolü", intervalDays: 365, regulatoryRef: "TS EN 62305", isMandatory: true, checklist: ["İniş iletkeni", "Topraklama direnci", "Korozyon"] },
  { code: "jenerator_bakim", equipmentType: "jenerator", name: "Jeneratör periyodik bakım", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Yağ ve filtre", "Akü", "Yakıt seviyesi", "Yük testi"] },
  { code: "jenerator_calistirma", equipmentType: "jenerator", name: "Jeneratör aylık çalıştırma testi", intervalDays: 30, regulatoryRef: null, isMandatory: false, checklist: ["Otomatik devreye girme", "Çalışma süresi", "Egzoz"] },
  { code: "ups_bakim", equipmentType: "ups", name: "UPS/kesintisiz güç kaynağı bakımı", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Akü ölçümü", "Fan temizliği"] },

  // --- Havalandırma / klima ---
  { code: "havalandirma_filtre", equipmentType: "havalandirma", name: "Havalandırma filtre değişimi", intervalDays: 90, regulatoryRef: null, isMandatory: false, checklist: ["Filtre değişimi", "Kanal kontrolü", "Fan yatakları"] },
  { code: "otopark_jet_fan", equipmentType: "havalandirma", name: "Kapalı otopark jet fan ve CO sensörü testi", intervalDays: 180, regulatoryRef: "Binaların Yangından Korunması Hakkında Yönetmelik md.53", isMandatory: true, checklist: ["CO sensör kalibrasyonu", "Jet fan çalışma testi", "Duman tahliye senaryosu"] },
  { code: "klima_bakim", equipmentType: "klima", name: "Ortak alan klima bakımı", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Gaz kontrolü", "Filtre temizliği", "Drenaj"] },

  // --- Güvenlik ---
  { code: "kamera_bakim", equipmentType: "kamera", name: "Güvenlik kamera sistemi bakımı", intervalDays: 180, regulatoryRef: "KVKK — kayıt süresi ve erişim yetkisi kontrolü", isMandatory: false, checklist: ["Görüntü netliği", "Kayıt süresi (max 30 gün)", "Disk sağlığı", "Aydınlatma levhası"] },
  { code: "interkom_bakim", equipmentType: "interkom", name: "Diafon/interkom sistemi kontrolü", intervalDays: 365, regulatoryRef: null, isMandatory: false, checklist: ["Daire cihazları", "Kapı açma", "Merkezi ünite"] },
  { code: "otomatik_kapi", equipmentType: "otomatik_kapi", name: "Otomatik bahçe/garaj kapısı bakımı", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Fotosel testi", "Motor yağlama", "Uzaktan kumanda"] },
  { code: "turnike_kartli_gecis", equipmentType: "gecis_kontrol", name: "Kartlı geçiş sistemi bakımı", intervalDays: 365, regulatoryRef: null, isMandatory: false, checklist: ["Okuyucu temizliği", "Yetki listesi güncelleme"] },

  // --- Bina / yapı ---
  { code: "cati_kontrol", equipmentType: "cati", name: "Çatı ve izolasyon kontrolü", intervalDays: 365, regulatoryRef: null, isMandatory: false, checklist: ["Kiremit/membran", "Su sızıntısı", "Baca dibi"] },
  { code: "dis_cephe", equipmentType: "dis_cephe", name: "Dış cephe ve mantolama kontrolü", intervalDays: 730, regulatoryRef: null, isMandatory: false, checklist: ["Çatlak taraması", "Dökülme riski", "Denizlik ve söve"] },
  { code: "deprem_kontrol", equipmentType: "yapi", name: "Yapı durum ve deprem risk değerlendirmesi", intervalDays: 1825, regulatoryRef: "6306 sayılı Afet Riski Altındaki Alanların Dönüştürülmesi Hakkında Kanun", isMandatory: false, checklist: ["Lisanslı kuruluş raporu", "Taşıyıcı sistem gözlemi"] },
  { code: "sigorta_dask", equipmentType: "sigorta", name: "DASK ve bina ortak alan sigortası yenileme", intervalDays: 365, regulatoryRef: "6305 sayılı Afet Sigortaları Kanunu (DASK zorunlu)", isMandatory: true, checklist: ["Poliçe yenileme", "Teminat güncelleme", "Poliçe arşivi"] },
  { code: "asansor_sigorta", equipmentType: "sigorta", name: "Asansör üçüncü şahıs mali mesuliyet sigortası", intervalDays: 365, regulatoryRef: "Asansör İşletme ve Bakım Yönetmeliği md.6", isMandatory: true, checklist: ["Poliçe yenileme"] },

  // --- Temizlik / çevre ---
  { code: "haşere_ilaclama", equipmentType: "ilaclama", name: "Haşere ilaçlaması (ortak alan)", intervalDays: 90, regulatoryRef: "Biyosidal Ürünlerin Kullanım Usul ve Esasları Yönetmeliği", isMandatory: false, checklist: ["Yetkili firma belgesi", "Uygulama tutanağı", "Sakin bilgilendirme"] },
  { code: "kemirgen_kontrol", equipmentType: "ilaclama", name: "Kemirgen kontrolü (rodent)", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["İstasyon kontrolü", "Yem yenileme"] },
  { code: "cop_konteyner", equipmentType: "temizlik", name: "Çöp toplama alanı dezenfeksiyonu", intervalDays: 90, regulatoryRef: null, isMandatory: false, checklist: ["Yıkama", "Dezenfeksiyon", "Koku kontrolü"] },
  { code: "peyzaj_budama", equipmentType: "peyzaj", name: "Ağaç budama ve peyzaj bakımı", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Budama", "Gübreleme", "Sulama sistemi"] },
  { code: "sulama_sistemi", equipmentType: "peyzaj", name: "Otomatik sulama sistemi kontrolü", intervalDays: 365, regulatoryRef: null, isMandatory: false, checklist: ["Vana ve zamanlayıcı", "Kış hazırlığı (boşaltma)"] },
  { code: "kar_buz_hazirlik", equipmentType: "sezonluk", name: "Kış hazırlığı (tuz, küreme, izolasyon)", intervalDays: 365, regulatoryRef: null, isMandatory: false, checklist: ["Tuz stoğu", "Küreme ekipmanı", "Dış musluk boşaltma"] },

  // --- Sosyal tesis ---
  { code: "havuz_bakim", equipmentType: "havuz", name: "Yüzme havuzu su analizi ve bakımı", intervalDays: 7, regulatoryRef: "Yüzme Havuzlarının Tabi Olacağı Sağlık Esasları Yönetmeliği", isMandatory: true, checklist: ["Klor/pH ölçümü", "Filtre geri yıkama", "Kayıt defteri"] },
  { code: "havuz_laboratuvar", equipmentType: "havuz", name: "Havuz suyu laboratuvar analizi", intervalDays: 30, regulatoryRef: "Yüzme Havuzları Yönetmeliği md.11", isMandatory: true, checklist: ["Numune alma", "Mikrobiyolojik analiz", "Rapor asma"] },
  { code: "sauna_hamam", equipmentType: "sosyal_tesis", name: "Sauna/hamam ekipman ve hijyen kontrolü", intervalDays: 90, regulatoryRef: null, isMandatory: false, checklist: ["Isıtıcı kontrolü", "Hijyen", "Havalandırma"] },
  { code: "spor_salonu", equipmentType: "sosyal_tesis", name: "Spor salonu ekipman bakımı", intervalDays: 180, regulatoryRef: null, isMandatory: false, checklist: ["Kablo/kayış kontrolü", "Yağlama", "Emniyet pimleri"] },
  { code: "cocuk_oyun_alani", equipmentType: "oyun_alani", name: "Çocuk oyun alanı güvenlik kontrolü", intervalDays: 90, regulatoryRef: "TS EN 1176 — oyun alanı güvenliği", isMandatory: false, checklist: ["Vida/bağlantı", "Zemin darbe emiciliği", "Keskin kenar"] },

  // --- Yönetsel periyotlar ---
  { code: "kat_malikleri_toplantisi", equipmentType: "yonetim", name: "Olağan kat malikleri toplantısı", intervalDays: 365, regulatoryRef: "KMK md.29 (yılda en az bir kez)", isMandatory: true, checklist: ["Çağrı (15 gün önce)", "Gündem", "Hazirun cetveli", "Karar defteri"] },
  { code: "isletme_projesi", equipmentType: "yonetim", name: "İşletme projesi hazırlanması ve tebliği", intervalDays: 365, regulatoryRef: "KMK md.37", isMandatory: true, checklist: ["Gelir-gider tahmini", "Kat maliklerine tebliğ", "İtiraz süresi (7 gün)"] },
  { code: "denetim_raporu", equipmentType: "yonetim", name: "Denetçi raporu", intervalDays: 365, regulatoryRef: "KMK md.41", isMandatory: true, checklist: ["Defter incelemesi", "Rapor karar defterine yazımı"] },
  { code: "sgk_bildirge", equipmentType: "personel", name: "Personel SGK bildirgesi ve prim ödemesi", intervalDays: 30, regulatoryRef: "5510 sayılı Kanun", isMandatory: true, checklist: ["Aylık prim hizmet belgesi", "Ödeme dekontu"] },
  { code: "vergi_muhtasar", equipmentType: "yonetim", name: "Muhtasar beyanname (personel varsa)", intervalDays: 90, regulatoryRef: "193 sayılı GVK md.98", isMandatory: true, checklist: ["Stopaj hesabı", "Beyanname", "Ödeme"] },
  { code: "kvkk_envanter", equipmentType: "yonetim", name: "KVKK veri envanteri gözden geçirme", intervalDays: 365, regulatoryRef: "KVKK md.12 / Veri Sorumluları Sicili Yönetmeliği", isMandatory: false, checklist: ["Envanter güncelleme", "Saklama süreleri", "İmha politikası"] },
];
