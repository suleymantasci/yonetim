import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Queue } from "bullmq";

import { QUEUE_EVENTS } from "@yonetim/jobs";
import { DOMAIN_EVENTS, type DomainEventPayload } from "@yonetim/notifications";

import { DbService } from "../db/db.service";

/**
 * `EventEmitterModule` `wildcard: true` + `delimiter: "."` ile kuruldu;
 * `**` iki seviyeli adların (`debt.created`) tamamını yakalıyor.
 */
const DOMAIN_EVENT_WILDCARD = "**";

const KNOWN = new Set<string>(DOMAIN_EVENTS);

/**
 * Domain olayı → kuyruk köprüsü — GAP 4.6.5, MIMARI-PLAN §10.
 *
 * NEDEN KÖPRÜ GEREKİYOR: `EventEmitter2` **süreç içi**. Api'de yayılan bir
 * olay worker'a kendiliğinden ulaşmaz. Bildirimi api'nin göndermesi de
 * seçenek değildi: WhatsApp gönderimi saniyeler sürebiliyor ve yeniden deneme
 * istiyor; bunu bir HTTP isteğinin içinde yapmak, sakinin borç kaydı için
 * beklediği yanıtı bir mesajlaşma sağlayıcısının hızına bağlamak olurdu.
 *
 * BU YÜZDEN: servis olayı yayar (senkron, ucuz), köprü kuyruğa yazar, worker
 * gönderir. Olayı yayan taraf bildirimin gidip gitmediğini **bilmez** ve
 * bilmemeli — aksi halde bildirim hatası iş akışını düşürürdü.
 *
 * KUYRUĞA YAZMA HATASI YUTULUYOR: Redis erişilemezse borç yine oluşur, yalnız
 * bildirim gitmez. Tersi — bildirim kuyruğu yüzünden borç yazılamaması —
 * çok daha kötü bir arıza olurdu.
 */
@Injectable()
export class DomainEventsBridge {
  private readonly logger = new Logger("DomainEvents");

  constructor(
    private readonly db: DbService,
    @InjectQueue(QUEUE_EVENTS)
    private readonly queue: Queue<DomainEventPayload>,
  ) {}

  /**
   * Tüm domain olaylarını tek dinleyici karşılıyor.
   *
   * Olay başına ayrı dekoratör yazmak, yeni bir olay eklendiğinde burayı da
   * güncellemeyi gerektirirdi — ve unutulan güncellemenin belirtisi "bildirim
   * gitmiyor" olurdu, yani fark edilmesi zor olan tür.
   */
  @OnEvent(DOMAIN_EVENT_WILDCARD, { async: true })
  async publish(payload: Omit<DomainEventPayload, "tenantId" | "requestId"> & {
    event: DomainEventPayload["event"];
    tenantId?: string;
  }): Promise<void> {
    const ctx = this.db.maybeCtx();
    const tenantId = payload.tenantId ?? ctx?.tenantId;
    if (!tenantId) {
      // Tenant'sız olay hedeflenemez: kime gönderileceği tanımsız.
      this.logger.warn({ event: "domain_event.no_tenant", name: payload.event });
      return;
    }

    // Bildirim doğurmayan olaylar da yayılıyor (`unit.created` gibi, iç
    // dinleyiciler için). Bunlar uyarı değil: kuyruğa yazmak boşuna iş olurdu
    // ve "uyarı" seviyesinde loglamak gerçek sorunları gürültüye gömerdi.
    if (!KNOWN.has(payload.event)) {
      this.logger.debug({ event: "domain_event.not_notifiable", name: payload.event });
      return;
    }

    try {
      await this.queue.add(
        payload.event,
        { ...payload, tenantId, requestId: ctx?.requestId },
        {
          attempts: 5,
          // Sağlayıcı geçici olarak düşerse tekrar denenir; artan bekleme
          // aynı anda ayağa kalkan servise yığılmayı önlüyor.
          backoff: { type: "exponential", delay: 10_000 },
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        },
      );
    } catch (error) {
      this.logger.error({
        event: "domain_event.enqueue_failed",
        name: payload.event,
        tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

