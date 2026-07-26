import type { LocaleContent } from "../index";

/** Türkçe pazarlama içeriği — SPEC Bölüm 10.1 (programmatic SEO, long-tail). */
export const trContent: LocaleContent = {
  killerFeatures: [
    {
      slug: "whatsapp-sakin-deneyimi",
      title: "WhatsApp'tan borç sorgulama",
      description:
        "Sakin uygulama indirmeden WhatsApp'a 'borc' yazar, anında bakiyesini görür ve kartla öder. " +
        "70 yaşındaki komşunuz bile ilk denemede kullanır.",
      detail:
        "Yapay zekâ değil, kural tabanlı komut motoru kullanır: %90+ doğrulukla niyeti tespit eder, " +
        "anlamadığında yöneticiye devreder. Meta service window içindeki cevaplar ücretsizdir.",
      specRef: "3.1 / 3.2",
    },
    {
      slug: "seffaf-komisyon",
      title: "Şeffaf komisyon göstergesi",
      description:
        "Ödeme ekranında platform ücreti ve banka komisyonu ayrı ayrı yazar. Gizli kesinti yok.",
      detail:
        "Rakiplerde en çok şikâyet edilen konu 'haksız hizmet bedeli kesintisi'. Biz her kuruşu makbuzda gösteriyoruz.",
      specRef: "1.2",
    },
    {
      slug: "aidat-degisiklik-timeline",
      title: "Değiştirilemez aidat geçmişi",
      description:
        "Her aidat değişikliği tarih, saat, eski ve yeni tutarla kayda geçer; sakinler de görür.",
      detail:
        "Veritabanı seviyesinde append-only: kayıt silinemez, düzenlenemez. Geriye dönük sessiz zam mümkün değil.",
      specRef: "1.2 / 3",
    },
    {
      slug: "butce-simulatoru",
      title: "Bütçe simülatörü (What-if)",
      description:
        "'Aidatı %20 artırırsam ne olur?' sorusunu 12 aylık nakit akışı tahminiyle yanıtlar.",
      detail:
        "Tahsilat oranı elastikiyeti, gider enflasyonu ve tek seferlik yatırımlar dahil edilir. " +
        "Tamamen deterministik hesap — Excel formülü mantığı.",
      specRef: "3.4",
    },
    {
      slug: "borcu-yoktur-belgesi",
      title: "Anında 'Borcu Yoktur' belgesi",
      description:
        "Sakin talep eder, sistem kontrol eder, doğrulama kodlu PDF saniyeler içinde hazırlanır.",
      detail: "Banka kredisi için günlerce beklemek yok. İsteğe bağlı KEP ile resmî gönderim.",
      specRef: "3.6",
    },
    {
      slug: "bakim-takvimi",
      title: "Yasal bakım takvimi",
      description:
        "Asansör muayenesi, baca temizliği, yangın tüpü dolumu… 50+ bakım tipi mevzuat referansıyla takip edilir.",
      detail:
        "T-30, T-15, T-7, T-0 ve T+3 günlerinde hatırlatma. Bakım sonrası belge yüklenir, sonraki tarih otomatik hesaplanır.",
      specRef: "3.7",
    },
    {
      slug: "kvkk-denetim",
      title: "KVKK denetim kütüğü ve risk skoru",
      description:
        "Kim hangi veriyi ne zaman gördü kayıt altında; duyurularınız gönderilmeden KVKK filtresinden geçer.",
      detail:
        "'3 numaralı daire borçlu' gibi ifadeler otomatik engellenir. Yöneticiye 0-100 risk skoru ve düzeltme adımları sunulur.",
      specRef: "3.3 / 6.4",
    },
    {
      slug: "banka-failover",
      title: "Çoklu banka + otomatik yedekleme",
      description:
        "Tek sağlayıcıya bağımlı değiliz. Biri düşerse diğeri devreye girer, mutabakat farkları kuyruğa yazılır.",
      detail:
        "Devre kesici (circuit breaker) ve yeniden deneme kuyruğu ile 'bir aydır tahsilat yansımıyor' sorunu yaşanmaz.",
      specRef: "3.10",
    },
    {
      slug: "icra-asistani",
      title: "Akıllı icra asistanı",
      description:
        "90 günü geçen borçlarda ihtarname taslağı, avukat ataması ve 8 aşamalı takip tablosu.",
      detail:
        "Tahsilat şansı skoru, borçlu profiline göre hangi yolun daha verimli olduğunu gösterir.",
      specRef: "3.5 / 6.12",
    },
    {
      slug: "veri-gecisi",
      title: "Rakip sistemden 1 saatte geçiş",
      description:
        "Apsiyon, Biyos, Dijiyon veya Yönetimcell dışa aktarımınızı yükleyin, sihirbaz eşleştirsin.",
      detail:
        "Mevcut sözleşmeniz bitene kadar ücret almadığımız geçiş kampanyası ile çift ödeme yapmazsınız.",
      specRef: "3.11 / 16",
    },
  ],

  faqs: [
    {
      question: "Aidat takip programı ne kadar sürede kurulur?",
      answer:
        "Kayıt olduktan sonra sihirbaz ortalama 15 dakikada tamamlanır: site bilgisi, daire listesi (toplu oluşturma veya Excel), ilk aidat tanımı ve sakin davetleri. Mevcut bir programdan geçiyorsanız dışa aktarım dosyanızı yükleyip eşleştirme yaparsınız.",
    },
    {
      question: "Sakinlerin uygulama indirmesi gerekiyor mu?",
      answer:
        "Hayır. Sakinler WhatsApp'tan 'borc' yazarak bakiyelerini öğrenip ödeme bağlantısı alabilir; isteyenler web portalını kullanır. Mobil uygulama canlı çıkıştan sonraki fazda gelecektir.",
    },
    {
      question: "Aidat gecikme tazminatı nasıl hesaplanıyor?",
      answer:
        "634 sayılı Kat Mülkiyeti Kanunu md.20 uyarınca aylık %5 üst sınırıyla hesaplanır. Kat malikleri kurulu daha düşük bir oran belirlediyse ayarlardan değiştirebilirsiniz; hesaplama her gün baştan yapıldığı için birikimli hata oluşmaz.",
    },
    {
      question: "Verilerimiz KVKK'ya uygun saklanıyor mu?",
      answer:
        "Evet. T.C. kimlik numarası, IBAN ve telefon gibi alanlar AES-256-GCM ile alan bazlı şifrelenir; her erişim denetim kütüğüne yazılır. KVKK md.11 talepleri 72 saat içinde yanıtlanır ve saklama süresi dolan veriler otomatik anonimleştirilir.",
    },
    {
      question: "Ödemelerden komisyon kesiyor musunuz?",
      answer:
        "Aidat tahsilatından platform komisyonu almıyoruz. Yalnızca bankanın/POS sağlayıcısının komisyonu vardır ve ödeme ekranında ayrı satır olarak gösterilir.",
    },
    {
      question: "Mevcut yönetim programımızın sözleşmesi devam ediyor, ne olacak?",
      answer:
        "Geçiş kampanyamız kapsamında mevcut sözleşmeniz bitene kadar (en fazla 12 ay) ücret almıyoruz. Verilerinizi şimdiden aktarıp paralel kullanabilirsiniz.",
    },
    {
      question: "Fiyatlar sonradan artar mı?",
      answer:
        "Yenilemede artış TÜFE bazlıdır ve sözleşme gereği en fazla %30 ile sınırlıdır. Kampanyayla aldığınız fiyat, dönem sonuna kadar kilitlidir.",
    },
    {
      question: "Deneme süresi için kredi kartı gerekiyor mu?",
      answer:
        "Hayır. 30 günlük deneme tamamen kartsızdır. Süre bitiminde otomatik ücret alınmaz; hesabınız askıya alınır ve verileriniz 6 ay saklanır.",
    },
  ],

  comparison: [
    { feature: "WhatsApp'tan borç sorgulama ve ödeme", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Şeffaf komisyon gösterimi", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Değiştirilemez aidat değişiklik geçmişi", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Bütçe simülatörü", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Anında Borcu Yoktur belgesi", us: true, apsiyon: "partial", biyos: false, yonetimcell: "partial" },
    { feature: "50+ yasal bakım şablonu", us: true, apsiyon: "partial", biyos: false, yonetimcell: "partial" },
    { feature: "KVKK risk skoru ve denetim kütüğü", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Çoklu banka failover", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "İcra takip modülü", us: true, apsiyon: true, biyos: false, yonetimcell: true },
    { feature: "Mobil uygulama", us: "soon", apsiyon: true, biyos: true, yonetimcell: true },
  ],

  posts: [
    {
      slug: "apartman-aidat-nasil-hesaplanir",
      category: "rehber",
      title: "Apartman aidatı nasıl hesaplanır? (2026 rehberi)",
      description:
        "Eşit paylaşım mı arsa payı mı? Kat Mülkiyeti Kanunu'na göre aidat hesaplama yöntemleri, örnek hesaplamalar ve sık yapılan hatalar.",
      publishedAt: "2026-01-15",
      readingMinutes: 7,
      keywords: ["apartman aidat hesaplama", "arsa payı aidat", "kat mülkiyeti aidat"],
      body: `## Aidat neye göre paylaşılır?

634 sayılı Kat Mülkiyeti Kanunu'nun 20. maddesi ortak giderleri ikiye ayırır:

- **Eşit paylaşılan giderler**: kapıcı, kaloriferci, bahçıvan, bekçi giderleri ve yönetim masrafları kat malikleri arasında **eşit** olarak bölüşülür.
- **Arsa payına göre paylaşılan giderler**: anagayrimenkulün sigorta primi, bakım ve koruma giderleri **arsa payı** oranında bölüşülür.

Yönetim planında farklı bir paylaşım öngörülmüşse, yönetim planı esas alınır.

## Örnek hesaplama

24 daireli bir apartmanda aylık gider toplamı 30.000 ₺ olsun:

1. Personel + yönetim gideri 18.000 ₺ → 24 daireye eşit: **750 ₺**
2. Bakım + sigorta 12.000 ₺ → arsa payına göre: arsa payı %5 olan daire **600 ₺**
3. Toplam: 750 + 600 = **1.350 ₺**

## Sık yapılan hatalar

- **Boş daireden aidat alınmaması.** Kanun boş daireyi muaf tutmaz; ortak gider yükümlülüğü devam eder.
- **Kiracının borcunu takip etmemek.** KMK md.22 uyarınca kiracı, kira bedeliyle sınırlı olarak malikle birlikte sorumludur.
- **Gecikme tazminatını unutmak.** Aylık %5'e kadar gecikme tazminatı istenebilir; bu, geciken sakini caydırır ve düzenli ödeyenlere haksızlığı önler.
- **Zammı duyurmadan uygulamak.** Aidat değişikliği kat malikleri kurulu kararına dayanmalı ve önceden duyurulmalıdır.

## Dijital yönetimde ne değişir?

Formülü bir kez tanımlarsınız; her ayın 1'inde tahakkuk otomatik oluşur, vade yaklaşınca hatırlatma gider, ödeme kartla yapılır ve makbuz anında düşer. Değişiklikler ise silinemeyen bir kayıt defterine yazılır — kimse geriye dönük sessiz zam yapamaz.`,
    },
    {
      slug: "kat-malikleri-toplantisi-yeter-sayisi",
      category: "mevzuat",
      title: "Kat malikleri toplantısında yeter sayısı: hangi karar kaç oyla alınır?",
      description:
        "KMK md.30, 31, 32 ve 44'e göre toplantı ve karar yeter sayıları, ikinci toplantı kuralı ve oy ağırlığı hesabı.",
      publishedAt: "2026-02-02",
      readingMinutes: 6,
      keywords: ["kat malikleri toplantısı yeter sayısı", "kmk 32", "apartman toplantı çoğunluk"],
      body: `## Toplantı yeter sayısı (md.30)

İlk toplantı için kat maliklerinin **sayı ve arsa payı bakımından yarıdan fazlasının** katılımı gerekir. Bu sağlanamazsa ikinci toplantı, en geç 15 gün sonra yapılır ve **katılanlarla** karar alınır.

## Karar yeter sayıları

| Konu | Gerekli çoğunluk | Dayanak |
| --- | --- | --- |
| Olağan gündem maddeleri | Katılanların salt çoğunluğu | md.32 |
| Yönetici / denetçi seçimi | Kat maliklerinin sayı ve arsa payı çoğunluğu | md.34, md.41 |
| Ortak yerlerde önemli yenilik | Kat maliklerinin 2/3'ü | md.42 |
| Yönetim planı değişikliği | Kat maliklerinin 4/5'i | md.28 |
| Anagayrimenkulün mimari durumunun değişmesi | Oybirliği | md.19 |

## Oy ağırlığı

Her bağımsız bölüm bir oy hakkı verir. Bir kişinin birden çok bağımsız bölümü varsa, oy sayısı bağımsız bölüm sayısı kadardır; ancak bu oy sayısı **tüm oyların üçte birinden fazla olamaz** (md.31).

## Tutanak ve karar defteri

Alınan kararlar, katılanların imzasıyla **karar defterine** yazılır. Karar defteri, itiraz ve icra süreçlerinde en önemli belgedir; dijital ortamda üretilen tutanağın çıktısı da imzalanarak deftere eklenmelidir.`,
    },
    {
      slug: "aidat-borcu-icra-takibi",
      category: "mevzuat",
      title: "Aidat borcu için icra takibi nasıl başlatılır?",
      description:
        "İhtarname, icra takibi, kanuni ipotek hakkı ve tahsilat stratejisi. Yöneticinin adım adım yol haritası.",
      publishedAt: "2026-03-10",
      readingMinutes: 8,
      keywords: ["aidat borcu icra", "apartman aidat davası", "kmk 22 kanuni ipotek"],
      body: `## 1. Önce yazılı ihtar

İcra takibinden önce borçluya yazılı ihtar gönderilmesi hem iyi niyet göstergesidir hem de sonraki aşamalarda delil oluşturur. İhtarnamede borcun dönemi, tutarı, gecikme tazminatı ve ödeme süresi açıkça yer almalıdır.

## 2. İcra takibi

Ortak gider alacağı için **ilamsız icra** takibi yapılabilir. Yönetici, kat malikleri kurulu kararına gerek olmadan (md.35) bu takibi başlatabilir.

## 3. Kanuni ipotek hakkı (md.22)

Ödenmeyen ortak gider alacağı için, alacaklı kat malikleri veya yönetici, borçlu bağımsız bölüm üzerine **kanuni ipotek** tescili isteyebilir. Bu, tahsilat şansını ciddi biçimde artırır.

## 4. Kiracıya başvuru

Kiracı, kira bedeli ile sınırlı olmak üzere ortak giderden malikle **müteselsilen** sorumludur. Kiracıya yapılacak bildirim, malike de yapılmalıdır.

## 5. Süreci veriyle yönetin

Hangi borçlunun ödeme geçmişi güçlü, hangisi ulaşılamaz durumda? Ödeme geçmişi, iletişim durumu ve borç yaşına bakan basit bir skor, hangi dosyada önce uzlaşma hangisinde doğrudan takip yapılacağını netleştirir.`,
    },
    {
      slug: "kvkk-apartman-yoneticisi",
      category: "mevzuat",
      title: "Apartman yöneticisi için KVKK: neyi paylaşabilirsiniz, neyi paylaşamazsınız?",
      description:
        "WhatsApp grubunda borç listesi paylaşmak neden ihlal? Aydınlatma metni, açık rıza ve 72 saatlik yanıt süresi.",
      publishedAt: "2026-04-05",
      readingMinutes: 6,
      keywords: ["apartman kvkk", "site yönetimi kişisel veri", "borç listesi paylaşma kvkk"],
      body: `## Site yönetimi de veri sorumlusudur

Kat malikleri kurulu adına hareket eden yönetim, sakinlerin ad-soyad, TCKN, telefon, IBAN ve borç bilgilerini işlediği için **veri sorumlusu** sayılır. Bu, aydınlatma yükümlülüğünü ve güvenlik tedbirlerini beraberinde getirir.

## En sık yapılan ihlal: borç listesi paylaşımı

Apartman WhatsApp grubunda "3 numaralı daire 4 aydır ödemiyor" yazmak, kişisel verinin hukuka aykırı biçimde üçüncü kişilere aktarılmasıdır. Doğru yöntem, borç bilgisini **yalnızca ilgili kişiye** bireysel olarak iletmektir.

## Yapılması gerekenler

1. Aydınlatma metnini yayınlayın ve yeni sakinlere kayıt anında gösterin.
2. Zorunlu işleme ile açık rızaya bağlı işlemeyi ayırın (pazarlama iletileri ayrı onaya tabidir).
3. TCKN, IBAN gibi alanları şifreli saklayın; erişim yetkisini sınırlayın.
4. Talepleri en geç 30 gün (uygulamada hedef: 72 saat) içinde yanıtlayın.
5. Saklama süresi dolan verileri anonimleştirin.

## Kamera kayıtları

Ortak alan kameraları meşru menfaate dayanır ancak bilgilendirme levhası zorunludur; kayıt süresi amaçla sınırlı (genellikle 30 günü aşmayacak) olmalıdır.`,
    },
    {
      slug: "site-yonetim-programi-secerken",
      category: "urun",
      title: "Site yönetim programı seçerken bakılması gereken 10 madde",
      description:
        "Fiyat dışında nelere bakmalı? Veri sahipliği, banka entegrasyonu, KVKK uyumu ve çıkış kolaylığı.",
      publishedAt: "2026-05-20",
      readingMinutes: 5,
      keywords: ["site yönetim programı", "apartman yönetim yazılımı seçimi"],
      body: `1. **Verinizi dışa aktarabiliyor musunuz?** Excel/CSV dışa aktarım yoksa kilitlenirsiniz.
2. **Banka entegrasyonu tek sağlayıcıya mı bağlı?** Tek sağlayıcı arızalandığında tahsilat görünmez olur.
3. **Komisyonlar açık mı?** Ödeme ekranında hangi kesintinin kime gittiği yazmalı.
4. **Aidat değişiklikleri kayıt altında mı?** Geriye dönük değişiklik izlenemiyorsa güven sorunu doğar.
5. **Sakinler için giriş engeli düşük mü?** Uygulama indirmeyi zorunlu kılan çözümler yaşlı sakinlerde çalışmaz.
6. **Yasal bakım takibi var mı?** Asansör ve yangın muayenesi kaçırılırsa ceza yöneticiye gelir.
7. **KVKK süreçleri hazır mı?** Aydınlatma metni, rıza kaydı ve talep yönetimi olmalı.
8. **Toplantı ve karar süreci destekleniyor mu?** Yeter sayısı hesabı elle yapılırsa hata kaçınılmaz.
9. **Destek nasıl veriliyor?** Sezon başında yanıt süresi uzayan sağlayıcılar sorun çıkarır.
10. **Fiyat artışı sözleşmede sınırlı mı?** Yenilemede sürpriz zam en sık şikâyet konusudur.`,
    },
  ],

  guides: [
    {
      slug: "apartman-aidat-zammi-nasil-hesaplanir",
      title: "Apartman aidat zammı nasıl hesaplanır?",
      summary:
        "Aidat artışı hangi kalemlere bakılarak belirlenir, kat malikleri kurulu kararı nasıl alınır, sakinlere nasıl duyurulur?",
      keywords: ["apartman aidat zammı", "aidat artışı hesaplama", "aidat zam oranı"],
      sections: [
        {
          heading: "Zam kararı kim verir?",
          body: "Aidat tutarı, işletme projesi kapsamında kat malikleri kurulunca belirlenir (KMK md.37). Yönetici tek başına kalıcı zam yapamaz; ancak işletme projesi onaylanana kadar geçici tahsilat yapılabilir.",
        },
        {
          heading: "Hangi kalemler artışı belirler?",
          body: "Personel giderleri (asgari ücret artışı ve SGK primi), enerji, bakım sözleşmeleri, sigorta poliçeleri ve planlanan yatırımlar. Bu kalemlerin ağırlıklı ortalaması gerçekçi artış oranını verir.",
        },
        {
          heading: "Tahsilat oranını unutmayın",
          body: "Tahakkuk ile tahsilat aynı şey değildir. %85 tahsilat oranıyla çalışan bir sitede, giderleri karşılamak için tahakkukun giderin yaklaşık %118'i olması gerekir.",
        },
        {
          heading: "Duyuru ve şeffaflık",
          body: "Artış, gerekçeleriyle birlikte önceden duyurulmalı ve değişiklik kaydı erişilebilir olmalıdır. Sessiz ve geriye dönük zam, en sık şikâyet konusudur.",
        },
      ],
    },
    {
      slug: "kapici-maasi-ve-sgk-hesaplama",
      title: "Kapıcı maaşı ve SGK primi nasıl hesaplanır?",
      summary:
        "Konut kapıcıları için asgari ücret, SGK prim oranları, vergi istisnaları ve kıdem tazminatı hesabı.",
      keywords: ["kapıcı maaşı hesaplama", "kapıcı sgk primi", "apartman görevlisi bordro"],
      sections: [
        {
          heading: "Vergi istisnası",
          body: "Konut kapıcıları, 193 sayılı Gelir Vergisi Kanunu kapsamında gelir vergisinden istisnadır; damga vergisi de aranmaz. Bu nedenle brüt-net farkı esas olarak SGK priminden oluşur.",
        },
        {
          heading: "SGK primi",
          body: "İşçi payı ve işveren payı ayrı hesaplanır. Site yönetimi işveren sıfatıyla aylık prim ve hizmet belgesini vermek ve primi süresinde ödemekle yükümlüdür.",
        },
        {
          heading: "Kıdem ve ihbar",
          body: "İş sözleşmesi sona erdiğinde her tam yıl için 30 günlük brüt ücret tutarında kıdem tazminatı doğar. Bu yük için yıl içinde karşılık ayırmak, ani nakit sıkışıklığını önler.",
        },
      ],
    },
    {
      slug: "asansor-yillik-muayene-zorunlulugu",
      title: "Asansör yıllık muayenesi zorunlu mu? Etiket renkleri ne anlama gelir?",
      summary:
        "Asansör periyodik kontrolü, A tipi muayene kuruluşu, yeşil/mavi/sarı/kırmızı etiket anlamları ve yöneticinin sorumluluğu.",
      keywords: ["asansör yıllık muayene", "asansör etiketi renkleri", "asansör bakım zorunluluğu"],
      sections: [
        {
          heading: "Yıllık kontrol zorunludur",
          body: "Asansörlerin yılda en az bir kez A tipi muayene kuruluşunca kontrol edilmesi zorunludur. Kontrol sonucu bir etiketle asansör kabininde gösterilir.",
        },
        {
          heading: "Etiket renkleri",
          body: "Yeşil: uygun. Mavi: hafif kusurlu, giderilmeli. Sarı: kusurlu, süre verilir. Kırmızı: güvensiz, asansör derhal hizmet dışı bırakılır.",
        },
        {
          heading: "Aylık bakım ayrı bir yükümlülüktür",
          body: "Yıllık muayene, aylık bakımın yerine geçmez. Yetkili servisle bakım sözleşmesi yapılması ve bakım kayıtlarının saklanması gerekir.",
        },
      ],
    },
    {
      slug: "kiraci-aidat-odemezse-ne-yapilir",
      title: "Kiracı aidat ödemezse ne yapılır?",
      summary:
        "Kiracı ve malikin müteselsil sorumluluğu, bildirimin kime yapılacağı ve icra sürecinin işleyişi.",
      keywords: ["kiracı aidat ödemezse", "aidat kiracı mı malik mi öder", "aidat borcu kiracı"],
      sections: [
        {
          heading: "Sorumluluk kimde?",
          body: "Kat Mülkiyeti Kanunu md.22 uyarınca kiracı, kira bedeli ile sınırlı olmak üzere malikle birlikte müteselsilen sorumludur. Yani yönetim alacağını malikten de isteyebilir.",
        },
        {
          heading: "Bildirim usulü",
          body: "Kiracıya yapılan ödeme çağrısının bir örneği malike de bildirilmelidir. Aksi halde malik, borçtan haberdar olmadığını ileri sürebilir.",
        },
        {
          heading: "Devir ve tahliye",
          body: "Kiracı taşındığında kalan borcun kime kalacağı yönetim planı ve devir protokolüne göre belirlenir; varsayılan uygulama borcun malike yansıtılmasıdır.",
        },
      ],
    },
    {
      slug: "isletme-projesi-nasil-hazirlanir",
      title: "İşletme projesi nasıl hazırlanır?",
      summary:
        "KMK md.37'ye göre işletme projesinin içeriği, tebliği, itiraz süresi ve icra edilebilirliği.",
      keywords: ["işletme projesi", "apartman işletme projesi örneği", "kmk 37"],
      sections: [
        {
          heading: "İçeriği",
          body: "Bir yıllık tahmini gelir ve gider tutarları, her kat malikine düşen ortak gider payı ve ödeme takvimi yer alır.",
        },
        {
          heading: "Tebliğ ve itiraz",
          body: "Proje kat maliklerine imza karşılığı veya taahhütlü mektupla bildirilir. Bildirimden itibaren 7 gün içinde itiraz edilmezse kesinleşir.",
        },
        {
          heading: "İcra kabiliyeti",
          body: "Kesinleşen işletme projesi, İcra ve İflas Kanunu anlamında belge niteliğindedir; ödenmeyen paylar için doğrudan takip yapılabilir.",
        },
      ],
    },
  ],
};
