import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { tenantArchiveRequest, type TenantArchiveRequest } from "@yonetim/contracts";

import { AllowArchived, RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { LifecycleService } from "./lifecycle.service";

/**
 * Site yaşam döngüsü — yönetici tarafı (`/panel/ayarlar` tehlikeli bölge).
 *
 * Kalıcı silme burada **yok**: o uç platform tarafında (`PlatformController`)
 * ve `tenant:delete` istiyor. Aynı controller'a koymak, yöneticinin gördüğü
 * yüzeyde geri dönüşü olmayan bir düğme bırakmak olurdu — RBAC onu engellerdi
 * ama yanlış yerde durması, bir gün yanlış izinle açılmasını kolaylaştırırdı.
 */
@ApiTags("panel/tenancy")
@Controller("v1/panel/tenancy/lifecycle")
export class LifecycleController {
  constructor(private readonly service: LifecycleService) {}

  @Get()
  @RequirePermission("tenant:read")
  state() {
    return this.service.state();
  }

  @Post("archive")
  @RequirePermission("tenant:archive")
  @ApiOperation({
    summary: "Siteyi pasife al (arşivle)",
    description:
      "Site salt-okunur olur, faturalama durur, **veri silinmez**. " +
      "`siteConfig.billing.archiveRecoveryDays` kadar süreyle geri alınabilir; " +
      "kalan süre satırdaki `purge_after_at` alanında sabitlenir, config " +
      "sonradan kısaltılsa bile değişmez.",
  })
  archive(@Body(new ZodBodyPipe(tenantArchiveRequest)) dto: TenantArchiveRequest) {
    return this.service.archive(dto.reason);
  }

  /**
   * `@AllowArchived()` şart: istek tanımı gereği arşivlenmiş bir siteye
   * yazıyor ve `TenantWritableGuard` onu aksi hâlde reddederdi — yani kurtarma
   * düğmesi kendi kuralına takılırdı.
   */
  @Post("restore")
  @RequirePermission("tenant:archive")
  @AllowArchived()
  @ApiOperation({
    summary: "Pasif siteyi geri aç",
    description:
      "Site arşivden **önceki** durumuna döner (denemedeyse denemeye). " +
      "Kurtarma penceresi dolmuşsa yönetici geri açamaz; platform rolleri " +
      "açabilir — pencerenin bir anlamı olmalı ama destek ekibinin elinde bir " +
      "kaçış kapısı da bulunmalı.",
  })
  restore(@Body(new ZodBodyPipe(tenantArchiveRequest)) dto: TenantArchiveRequest) {
    return this.service.restore(dto.reason);
  }
}
