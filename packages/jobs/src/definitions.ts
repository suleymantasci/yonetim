/**
 * Zamanlanmış işler — SPEC Bölüm 6.1 / 8 / 15.3.
 * Cron ifadeleri Europe/Istanbul saatine göredir.
 * Çalıştırıcı: `apps/worker` (BullMQ repeatable job). Bu liste **tek kaynak** —
 * `queue.ts` zamanlama tablosunu buradan türetiyor, ikinci bir liste yok.
 */
export interface JobDefinition {
  id: string;
  name: string;
  cron: string;
  description: string;
  timeoutSeconds: number;
  /** Aynı anda tek çalışma (idempotans için). */
  singleton: boolean;
  specRef: string;
}

export const JOBS: JobDefinition[] = [
  {
    id: "dues.generate-monthly",
    name: "Aylık borç üretimi",
    cron: "0 3 1 * *",
    description:
      "Her ayın 1'i 03:00'te aktif aidat planlarına göre tüm birimlere borç kaydı üretir (idempotent).",
    timeoutSeconds: 900,
    singleton: true,
    specRef: "Bölüm 6.1 / Faz 3",
  },
  {
    id: "dues.late-fee",
    name: "Gecikme tazminatı hesaplama",
    cron: "0 4 * * *",
    description: "Vadesi geçmiş borçlara KMK md.20 uyarınca aylık %5 gecikme tazminatı işler.",
    timeoutSeconds: 600,
    singleton: true,
    specRef: "Bölüm 6.1",
  },
  {
    id: "dues.reminder",
    name: "Aidat hatırlatma",
    cron: "0 10 * * *",
    description: "Vadesine 5 gün kalan borçlar için WhatsApp/SMS hatırlatması gönderir.",
    timeoutSeconds: 600,
    singleton: false,
    specRef: "Bölüm 8.2",
  },
  {
    id: "dues.late-warning",
    name: "Gecikme uyarısı",
    cron: "30 10 * * *",
    description: "Vadesi 7 gün geçen borçlar için gecikme uyarısı gönderir.",
    timeoutSeconds: 600,
    singleton: false,
    specRef: "Bölüm 8.2",
  },
  {
    id: "legal.escalate",
    name: "İcra eşiği taraması",
    cron: "0 5 * * 1",
    description: "90+ gün gecikmiş borçlar için icra asistanı akışını tetikler ve tahsilat skoru hesaplar.",
    timeoutSeconds: 600,
    singleton: true,
    specRef: "Bölüm 3.5 / 6.12",
  },
  {
    id: "bank.sync",
    name: "Banka hareket senkronizasyonu",
    cron: "*/30 * * * *",
    description: "Open banking sağlayıcılarından hareketleri çeker, ödemelerle eşleştirir.",
    timeoutSeconds: 300,
    singleton: true,
    specRef: "Bölüm 7.2 / 3.10",
  },
  {
    id: "bank.reconcile",
    name: "Mutabakat kontrolü",
    cron: "0 6 * * *",
    description: "Webhook ile alınan ödemeleri banka ekstresiyle karşılaştırır, farkları kuyruğa yazar.",
    timeoutSeconds: 600,
    singleton: true,
    specRef: "Bölüm 3.10",
  },
  {
    id: "maintenance.reminders",
    name: "Bakım hatırlatmaları",
    cron: "0 9 * * *",
    description: "T-30/T-15/T-7/T-0/T+3 günlerinde periyodik bakım hatırlatması gönderir.",
    timeoutSeconds: 600,
    singleton: false,
    specRef: "Bölüm 3.7",
  },
  {
    id: "sla.breach-check",
    name: "SLA ihlal kontrolü",
    cron: "*/15 * * * *",
    description: "Süresi dolan talepleri işaretler ve yöneticiye alarm gönderir.",
    timeoutSeconds: 120,
    singleton: false,
    specRef: "Bölüm 6.3",
  },
  {
    id: "billing.trial-expiry",
    name: "Deneme süresi kontrolü",
    cron: "0 2 * * *",
    description: "Deneme süresi biten siteleri askıya alır, veriyi 6 ay saklar.",
    timeoutSeconds: 300,
    singleton: true,
    specRef: "Bölüm 2.3 / 15.1",
  },
  {
    id: "billing.dunning",
    name: "Dunning akışı",
    cron: "0 11 * * *",
    description: "Başarısız SaaS ödemelerinde 1/3/7/14/30. gün adımlarını uygular.",
    timeoutSeconds: 300,
    singleton: true,
    specRef: "Bölüm 15.3",
  },
  {
    id: "billing.archive-purge",
    name: "Arşiv tasfiyesi",
    cron: "30 3 * * *",
    description: "Kurtarma penceresi (90 gün) dolan arşivli siteleri kalıcı olarak tasfiye eder.",
    timeoutSeconds: 300,
    singleton: true,
    specRef: "Bölüm 2.3",
  },
  {
    id: "billing.renewal",
    name: "Yenileme ve fatura",
    cron: "0 1 * * *",
    description: "Dönemi biten abonelikleri yeniler, e-fatura oluşturur, SMS aşımını faturalar.",
    timeoutSeconds: 600,
    singleton: true,
    specRef: "Bölüm 15.1 / 15.4",
  },
  {
    id: "kvkk.retention",
    name: "KVKK saklama süresi taraması",
    cron: "0 3 * * 0",
    description: "Saklama süresi dolan eski sakinleri bulur ve yöneticiye ayda bir hatırlatır; silme kararı yöneticide.",
    timeoutSeconds: 900,
    singleton: true,
    specRef: "Bölüm 14.1",
  },
  {
    id: "kvkk.request-sla",
    name: "KVKK talep SLA kontrolü",
    cron: "0 * * * *",
    description: "Yasal yanıt süresinin (30 gün, md.13) son 7 gününe giren ve süresi geçen başvurular için yöneticiye uyarı üretir.",
    timeoutSeconds: 120,
    singleton: false,
    specRef: "Bölüm 14.1 / 19.4",
  },
  {
    id: "nps.monthly-survey",
    name: "NPS anketi",
    cron: "0 12 5 * *",
    description: "Her ay rastgele sakinlere memnuniyet anketi gönderir.",
    timeoutSeconds: 300,
    singleton: true,
    specRef: "Bölüm 3.8",
  },
  {
    id: "reports.monthly",
    name: "Aylık yönetim raporu",
    cron: "0 8 5 * *",
    description: "Ayın 5'inde yöneticilere e-posta ile dönem raporu gönderir.",
    timeoutSeconds: 600,
    singleton: true,
    specRef: "Bölüm 6.13",
  },
  {
    id: "meetings.reminders",
    name: "Toplantı hatırlatmaları",
    cron: "0 10 * * *",
    description: "T-15/T-7/T-1 günlerinde toplantı davetlerini tekrarlar.",
    timeoutSeconds: 300,
    singleton: false,
    specRef: "Bölüm 6.6",
  },
  {
    id: "documents.expiry",
    name: "Belge son kullanma kontrolü",
    cron: "0 9 * * 1",
    description: "Süresi dolmak üzere olan sözleşme/poliçe/ruhsatları hatırlatır.",
    timeoutSeconds: 300,
    singleton: false,
    specRef: "Bölüm 6.10",
  },
  {
    id: "demo.maintenance",
    name: "Demo hesap bakımı",
    cron: "*/10 * * * *",
    description:
      "Süresi dolan demo siteleri bütün verisiyle siler, bitişe 3 saat kala hatırlatma gönderir, takılan kurulumları ve bekleyen eski talepleri kapatır.",
    timeoutSeconds: 300,
    singleton: true,
    specRef: "Demo hesap tasarımı (2026-10-07)",
  },
  {
    id: "landing.revalidate",
    name: "Site landing sayfası yenileme",
    cron: "0 4 * * *",
    description: "Public landing sayfalarının ISR cache'ini günde bir yeniler.",
    timeoutSeconds: 300,
    singleton: true,
    specRef: "Bölüm 10.1",
  },
];

export function jobById(id: string): JobDefinition | undefined {
  return JOBS.find((j) => j.id === id);
}

/**
 * İş kimliğinin URL güvenli hali: `dues.generate-monthly` → `dues-generate-monthly`.
 * Ters çevirme belirsiz olduğu için (iki ayrı ayırıcı tek karaktere iner) çözümleme
 * daima aynı dönüşümü uygulayıp karşılaştırarak yapılır.
 */
export function jobSlug(id: string): string {
  return id.replace(/\./g, "-");
}

export function jobBySlug(slug: string): JobDefinition | undefined {
  return JOBS.find((j) => jobSlug(j.id) === slug);
}
