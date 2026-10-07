import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  accessRequestDecision,
  occupancyCreate,
  occupancyEnd,
  occupancyUpdate,
  residentCreate,
  residentIds,
  residentListQuery,
  residentUpdate,
  tcknLookupQuery,
  whatsappOptInPatch,
  type AccessRequestDecision,
  type OccupancyCreate,
  type OccupancyEnd,
  type OccupancyUpdate,
  type ResidentCreate,
  type ResidentListQuery,
  type ResidentUpdate,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe, ZodQueryPipe } from "../../infra/zod/zod-dto";
import { AccessRequestService } from "./access-request.service";
import { ResidentService } from "./resident.service";

/**
 * Panel iç BFF yüzeyi — `/v1/panel/residents`.
 *
 * Her okuma ucu KVKK erişim kaydı bırakır; kaydı **servis** yazar (§8.4), bu
 * yüzden burada interceptor yok. Uçların hiçbiri açık TCKN ya da ham telefon
 * döndürmez — sözleşme (`phoneMasked` / `tcknMasked`) buna izin vermiyor.
 */
@ApiTags("panel/residents")
@Controller("v1/panel/residents")
export class ResidentController {
  constructor(
    private readonly service: ResidentService,
    private readonly accessRequest: AccessRequestService,
  ) {}

  @Get()
  @RequirePermission("resident:read")
  @ApiOperation({
    summary: "Sakin listesi — kişi merkezli, tek cari",
    description:
      "Satır birim değil **kişi**: bir kişi beş dairede malik olsa da tek satır " +
      "ve tek bakiye. Yanıttaki kişi kümesi `data_access_logs`'a yazılır.",
  })
  list(@Query(new ZodQueryPipe(residentListQuery)) q: ResidentListQuery) {
    return this.service.list(q);
  }

  /**
   * Erişim talepleri — `/kayit-talebi`'nden gelen onay kuyruğu.
   *
   * `/:id` deseninden **önce** tanımlı olmalı, aksi halde "access-requests"
   * bir kimlik sanılır ve `ParseUUIDPipe` 400 döndürür.
   */
  @Get("access-requests")
  @RequirePermission("resident:invite")
  accessRequestList() {
    return this.accessRequest.list();
  }

  @Post("access-requests/:id/approve")
  @RequirePermission("resident:invite")
  @ApiOperation({
    summary: "Erişim talebini onayla — üyelik ve daire ilişkisi açılır",
    description:
      "Daire **yöneticiden** gelir: başvurunun `unitLabel` alanı serbest " +
      "metin ve beyandır. Otomatik eşleşme yalnız öneri olarak gösterilir; " +
      "bağlayıcı olsaydı '3. daire' yazan herkes o dairenin sakini olurdu.",
  })
  approveAccessRequest(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(accessRequestDecision)) dto: AccessRequestDecision,
  ) {
    return this.accessRequest.approve(id, dto);
  }

  @Post("access-requests/:id/reject")
  @RequirePermission("resident:invite")
  rejectAccessRequest(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(accessRequestDecision)) dto: AccessRequestDecision,
  ) {
    return this.accessRequest.reject(id, dto);
  }

  /** Combobox (borç/ödeme ekranları) — detaydan önce tanımlı olmalı. */
  @Get("options")
  @RequirePermission("resident:read")
  options() {
    return this.service.options();
  }

  /**
   * Acil durum raporu — `/:id` deseninden **önce** tanımlı olmalı, aksi halde
   * "acil-durum" bir kimlik sanılır ve `ParseUUIDPipe` 400 döndürür.
   */
  @Get("emergency")
  @RequirePermission("resident:read")
  @ApiOperation({
    summary: "Acil durum listesi — kan grubu ve acil durum kişisi",
    description:
      "Kan grubu **KVKK md.6 özel nitelikli (sağlık) veri**; yalnız açık " +
      "rızası olan kişilerde dolu olur. Acil durum telefonu bu uçta " +
      "**maskesiz** döner (maskeli numara acil durumda aranamaz); bedeli " +
      "erişim denetimiyle ödenir — her çağrı `data_access_logs`'a ayrıca " +
      "`saglik_bilgisi` kategorisiyle yazılır.",
  })
  emergencyReport() {
    return this.service.emergencyReport();
  }

  @Get("tckn-lookup")
  @RequirePermission("resident:read")
  @ApiOperation({
    summary: "TCKN çakışma kontrolü (blind index)",
    description:
      "Arama şifreli değer üzerinde değil **blind index** üzerinde yapılır ve " +
      "yalnız bu sitenin üyeleriyle sınırlıdır. Her çağrı KVKK erişim kaydı bırakır.",
  })
  findByTckn(@Query(new ZodQueryPipe(tcknLookupQuery)) q: { tckn: string }) {
    return this.service.findByTckn(q.tckn);
  }

  @Post()
  @RequirePermission("resident:write")
  @ApiOperation({
    summary: "Sakin oluştur veya mevcut kişiyi siteye bağla",
    description:
      "Aynı telefon/e-posta ile kayıtlı kişi varsa yeni kullanıcı açılmaz; " +
      "mevcut kayıt bu siteye bağlanır (`linkedExisting: true`). Aydınlatma " +
      "onayı olmadan istek 400 `consent_required` döner.",
  })
  create(@Body(new ZodBodyPipe(residentCreate)) dto: ResidentCreate) {
    return this.service.create(dto);
  }

  @Post("whatsapp")
  @RequirePermission("resident:write")
  setWhatsappOptIn(
    @Body(new ZodBodyPipe(whatsappOptInPatch))
    dto: {
      ids: string[];
      optIn: boolean;
    },
  ) {
    return this.service.setWhatsappOptIn(dto.ids, dto.optIn);
  }

  @Post("remove")
  @RequirePermission("resident:write")
  @ApiOperation({
    summary: "Sakini siteden çıkar",
    description:
      "`users` kaydı silinmez — kişi başka sitelerde de kayıtlı olabilir. " +
      "Silinen, bu sitedeki üyelik ve açık ilişkilerdir. Açık borcu olan " +
      "atlanır ve `skipped` içinde sayılır.",
  })
  remove(@Body(new ZodBodyPipe(residentIds)) dto: { ids: string[] }) {
    return this.service.remove(dto.ids);
  }

  @Post("occupancy")
  @RequirePermission("resident:write")
  addOccupancy(@Body(new ZodBodyPipe(occupancyCreate)) dto: OccupancyCreate) {
    return this.service.addOccupancy(dto);
  }

  @Patch("occupancy/:id")
  @RequirePermission("resident:write")
  @ApiOperation({
    summary: "İlişkiyi düzelt (hisse, başlangıç, devir politikası)",
    description:
      "Gerekçe zorunlu. Malik hisseleri dairede %100'ü geçerse 409 " +
      "(`conflict:ownership_over_100`).",
  })
  updateOccupancy(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(occupancyUpdate)) dto: OccupancyUpdate,
  ) {
    return this.service.updateOccupancy(id, dto);
  }

  @Patch("occupancy/:id/end")
  @RequirePermission("resident:write")
  @ApiOperation({
    summary: "İlişkiyi bitir ve kalan borcu devret",
    description:
      "`transferTo`: `owner` borcu aktif malike geçirir, `next_tenant` deviri " +
      "erteleyip borçları işaretler, `keep` borcu kişide bırakır. Aktif malik " +
      "yoksa `owner` seçimi 409 döner.",
  })
  endOccupancy(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(occupancyEnd)) dto: OccupancyEnd,
  ) {
    return this.service.endOccupancy(id, dto);
  }

  @Get(":id")
  @RequirePermission("resident:read")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Get(":id/edit")
  @RequirePermission("resident:write")
  @ApiOperation({
    summary: "Düzenleme formu ön dolgusu — ham telefon döner",
    description:
      "Maskeli değer forma yazılsaydı kaydetmek numarayı maskeyle ezerdi. " +
      "Ham değer bu yüzden ayrı, `resident:write` isteyen ve KVKK kütüğüne " +
      "ayrı amaçla yazılan bir uçta. TCKN yine dönmez.",
  })
  editForm(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.editForm(id);
  }

  @Patch(":id")
  @RequirePermission("resident:write")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(residentUpdate)) dto: ResidentUpdate,
  ) {
    // Gövdedeki id yol parametresiyle çelişirse yol kazanır: yetki kontrolü
    // yola göre yapılıyor, gövdenin onu ezmesine izin verilmez.
    return this.service.update({ ...dto, id });
  }
}
