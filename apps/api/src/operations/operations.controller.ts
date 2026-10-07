import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  maintenanceComplete,
  maintenanceSave,
  meterBill,
  meterReadingBatch,
  meterReadingCorrect,
  meterReadingRemove,
  meterSave,
  requestAssignPatch,
  requestCommentCreate,
  requestSave,
  requestStatusPatch,
  reservationCancel,
  reservationCreate,
  reservationDecide,
  resourceSave,
  type MaintenanceComplete,
  type MaintenanceSave,
  type MeterBill,
  type MeterReadingBatch,
  type MeterReadingCorrect,
  type MeterReadingRemove,
  type MeterSave,
  type RequestAssignPatch,
  type RequestCommentCreate,
  type RequestSave,
  type RequestStatusPatch,
  type ReservationCancel,
  type ReservationCreate,
  type ReservationDecide,
  type ResourceSave,
} from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { MaintenanceWriteService } from "./maintenance-write.service";
import { MeterWriteService } from "./meter-write.service";
import { OperationsService } from "./operations.service";
import { RequestWriteService } from "./request-write.service";
import { ReservationWriteService } from "./reservation-write.service";

/**
 * Panel iç BFF yüzeyi — `/v1/panel/operations/*`.
 *
 * Dört ekranın dördü de "liste + üstünde sayaçlar" biçiminde; sayaçlar
 * yanıtın içinde geliyor (§9a) çünkü hepsi sunucu saatine göre hesaplanan
 * zaman karşılaştırmaları.
 */
@ApiTags("panel/operations")
@Controller("v1/panel/operations")
export class OperationsController {
  constructor(
    private readonly service: OperationsService,
    private readonly requestWrite: RequestWriteService,
    private readonly maintenanceWrite: MaintenanceWriteService,
    private readonly meterWrite: MeterWriteService,
    private readonly reservationWrite: ReservationWriteService,
  ) {}

  @Get("requests")
  @RequirePermission("request:read")
  @ApiOperation({
    summary: "Talep listesi + SLA sayaçları",
    description:
      "`slaBreached` sunucu saatine göre hesaplanır: saati şaşmış bir " +
      "tarayıcı 'gecikti mi' sorusuna yanlış cevap vermesin.",
  })
  requests() {
    return this.service.requests();
  }

  @Post("requests")
  @RequirePermission("request:write")
  @ApiOperation({
    summary: "Talep/arıza kaydı aç",
    description:
      "Kod (`TLP-yyyy-nnnn`) ve SLA vadesi **sunucuda** üretilir: kod site " +
      "içinde tekil olmalı, vade ise önceliğe bağlı bir söz " +
      "(`siteConfig.sla`) ve ölçütü sunucunun saati.",
  })
  createRequest(@Body(new ZodBodyPipe(requestSave)) dto: RequestSave) {
    return this.requestWrite.save(dto);
  }

  @Get("requests/:id")
  @RequirePermission("request:read")
  @ApiOperation({ summary: "Talep detayı + yorum akışı" })
  requestDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.requestWrite.detail(id);
  }

  @Patch("requests/:id")
  @RequirePermission("request:write")
  @ApiOperation({
    summary: "Talep kaydını güncelle",
    description:
      "Öncelik değişirse SLA vadesi **açılış anından** yeniden hesaplanır, " +
      "'şimdi'den değil: aksi hâlde geciken bir talebin önceliğini " +
      "yükseltmek gecikmeyi silerdi.",
  })
  updateRequest(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(requestSave)) dto: RequestSave,
  ) {
    return this.requestWrite.save(dto, id);
  }

  @Patch("requests/:id/status")
  @RequirePermission("request:write")
  @ApiOperation({
    summary: "Talep durumunu değiştir",
    description:
      "Zaman damgaları (ilk yanıt, çözüm, kapanış) geçişin ürettiği izlerdir " +
      "ve sunucuda yazılır — form alanı olsalardı geçmişe dönük tarihle SLA " +
      "ölçümü anlamsızlaştırılabilirdi. `resolutionNote` doluysa yorum " +
      "akışına düşer.",
  })
  setRequestStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(requestStatusPatch)) dto: RequestStatusPatch,
  ) {
    return this.requestWrite.setStatus(id, dto);
  }

  /**
   * Atama — `request:write` değil **`request:assign`**.
   *
   * Ayrı yetki olmasının sebebi rol dağılımı: `staff` rolü talep açabilir ve
   * güncelleyebilir ama kimin hangi işi yapacağına karar vermek yönetimin
   * işi (`packages/core/rbac`).
   */
  @Patch("requests/:id/assignment")
  @RequirePermission("request:assign")
  @ApiOperation({ summary: "Talebi bir görevliye ata (null: atamayı kaldır)" })
  assignRequest(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(requestAssignPatch)) dto: RequestAssignPatch,
  ) {
    return this.requestWrite.assign(id, dto);
  }

  @Post("requests/:id/comments")
  @RequirePermission("request:write")
  @ApiOperation({
    summary: "Talebe yorum ekle",
    description:
      "`isInternal` sakine gösterilmeyen not demek. Ayrı tablo değil bayrak: " +
      "iç not çoğu zaman sakine yazılan cevabın hemen yanında geliyor ve " +
      "iki tabloya bölmek her okumada zaman sırasını birleştirmek olurdu.",
  })
  commentRequest(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(requestCommentCreate)) dto: RequestCommentCreate,
  ) {
    return this.requestWrite.addComment(id, dto);
  }

  @Get("maintenance")
  @RequirePermission("maintenance:read")
  @ApiOperation({
    summary: "Bakım planı + yasal şablon kütüphanesi",
    description:
      "Site kendi şablonlarını tanımlamadıysa yasal tohum listesi döner " +
      "(`templatesAreSeed: true`); boş liste zorunlu bakımları gizlerdi.",
  })
  maintenance() {
    return this.service.maintenance();
  }

  @Post("maintenance")
  @RequirePermission("maintenance:write")
  @ApiOperation({
    summary: "Bakım planı kaydı aç",
    description:
      "Şablon yalnız başlangıç noktası: ad, periyot ve ekipman türü kayda " +
      "**kopyalanır**. Şablon sonradan değişirse geçmiş planların vadesi " +
      "kaymasın diye.",
  })
  createMaintenance(
    @Body(new ZodBodyPipe(maintenanceSave)) dto: MaintenanceSave,
  ) {
    return this.maintenanceWrite.save(dto);
  }

  @Get("maintenance/:id")
  @RequirePermission("maintenance:read")
  @ApiOperation({ summary: "Bakım planı detayı (düzenleme formu için)" })
  maintenanceDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.maintenanceWrite.detail(id);
  }

  @Patch("maintenance/:id")
  @RequirePermission("maintenance:write")
  @ApiOperation({ summary: "Bakım planını güncelle" })
  updateMaintenance(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(maintenanceSave)) dto: MaintenanceSave,
  ) {
    return this.maintenanceWrite.save(dto, id);
  }

  /**
   * "Bakım yapıldı" — plan düzenlemesinden **ayrı** uç.
   *
   * Aynı forma toplansaydı, planı düzelten biri son bakım tarihini de farkında
   * olmadan değiştirebilirdi; o tarih yasal denetimde sorulan şey.
   */
  @Post("maintenance/:id/complete")
  @RequirePermission("maintenance:write")
  @ApiOperation({
    summary: "Bakımı yapıldı olarak işaretle",
    description:
      "Sıradaki vade **yapıldığı tarihten** ilerler, planlanandan değil: " +
      "planlanandan zincirlenseydi geç yapılan bir bakım tamamlandığı anda " +
      "yine gecikmiş görünürdü.",
  })
  completeMaintenance(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(maintenanceComplete)) dto: MaintenanceComplete,
  ) {
    return this.maintenanceWrite.complete(id, dto);
  }

  @Delete("maintenance/:id")
  @RequirePermission("maintenance:write")
  @ApiOperation({
    summary: "Bakım planını kaldır (yalnız hatalı kayıt için)",
    description:
      "Takibi bırakmak için doğru yol `isActive: false`. Bu uç, yanlış " +
      "açılmış kayıt içindir ve yumuşak siler.",
  })
  deleteMaintenance(@Param("id", ParseUUIDPipe) id: string) {
    return this.maintenanceWrite.remove(id);
  }

  @Get("reservations")
  @RequirePermission("reservation:read")
  reservations() {
    return this.service.reservations();
  }

  /**
   * Tesis tanımı — modülün **girişi**.
   *
   * Bu uç olmadan rezervasyon ekranı yalnız boş bir liste gösterebiliyordu:
   * `resources` tablosunun yazma yolu hiç yazılmamıştı.
   */
  @Post("reservations/resources")
  @RequirePermission("reservation:write")
  @ApiOperation({ summary: "Rezerve edilebilir tesis tanımla" })
  createResource(@Body(new ZodBodyPipe(resourceSave)) dto: ResourceSave) {
    return this.reservationWrite.saveResource(dto);
  }

  @Get("reservations/resources/:id")
  @RequirePermission("reservation:read")
  @ApiOperation({ summary: "Tesis detayı (düzenleme formu için)" })
  resourceDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.reservationWrite.resourceDetail(id);
  }

  @Patch("reservations/resources/:id")
  @RequirePermission("reservation:write")
  @ApiOperation({ summary: "Tesisi güncelle" })
  updateResource(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(resourceSave)) dto: ResourceSave,
  ) {
    return this.reservationWrite.saveResource(dto, id);
  }

  @Delete("reservations/resources/:id")
  @RequirePermission("reservation:write")
  @ApiOperation({
    summary: "Tesisi kaldır",
    description:
      "Gelecek tarihli iptal edilmemiş rezervasyonu varsa 409 döner: " +
      "silinseydi sakinin elinde onaylı ama artık var olmayan bir " +
      "rezervasyon kalırdı. Önce rezervasyonlar iptal edilmeli.",
  })
  deleteResource(@Param("id", ParseUUIDPipe) id: string) {
    return this.reservationWrite.removeResource(id);
  }

  @Post("reservations")
  @RequirePermission("reservation:write")
  @ApiOperation({
    summary: "Rezervasyon oluştur",
    description:
      "Ücret **tarifeden ve süreden** türetilir, istemciden alınmaz: aynı " +
      "salon iki sakine iki farklı fiyata verilemesin. Çakışma kontrolü " +
      "yarı açık aralıkla (`[start, end)`) yapılır — bitişik rezervasyonlar " +
      "çakışma değildir. Onay bekleyen talepler de yeri tutar.",
  })
  createReservation(
    @Body(new ZodBodyPipe(reservationCreate)) dto: ReservationCreate,
  ) {
    return this.reservationWrite.create(dto);
  }

  /**
   * Onay / ret / iptal — `reservation:approve`.
   *
   * `reservation:write`'tan ayrı: sakin (portal rolü) kendi adına rezervasyon
   * **talebi** açabiliyor ama onaylayan yönetim.
   */
  @Post("reservations/:id/cancel")
  @RequirePermission("reservation:write")
  @ApiOperation({
    summary: "Rezervasyonu iptal et (sahibi ya da yönetim)",
    description:
      "Sakin yalnız kendi, başlamamış, beklemede/onaylı rezervasyonunu iptal " +
      "eder; başkasınınki 404, başlamış olan 409.",
  })
  cancelReservation(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(reservationCancel)) dto: ReservationCancel,
  ) {
    return this.reservationWrite.cancel(id, dto.reason);
  }

  @Patch("reservations/:id/decision")
  @RequirePermission("reservation:approve")
  @ApiOperation({
    summary: "Rezervasyonu onayla / reddet / iptal et",
    description:
      "İptal edilmiş bir rezervasyon yeniden onaylanamaz (400): aradaki " +
      "sürede o saat başkasına verilmiş olabilir ve geri almak çakışma " +
      "kontrolünü atlatmak olurdu.",
  })
  decideReservation(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(reservationDecide)) dto: ReservationDecide,
  ) {
    return this.reservationWrite.decide(id, dto);
  }

  @Get("meters")
  @RequirePermission("meter:read")
  meters() {
    return this.service.meters();
  }

  @Post("meters")
  @RequirePermission("meter:write")
  @ApiOperation({
    summary: "Sayaç tanımla",
    description:
      "Ortak alan sayacı ile daireye bağlı sayaç birbirini dışlar: ikisi " +
      "birden dolu olsaydı aynı m³ hem ortak gidere hem tek daireye yazılır, " +
      "iki kez faturalanırdı.",
  })
  createMeter(@Body(new ZodBodyPipe(meterSave)) dto: MeterSave) {
    return this.meterWrite.save(dto);
  }

  @Get("meters/:id")
  @RequirePermission("meter:read")
  @ApiOperation({ summary: "Sayaç detayı (düzenleme formu için)" })
  meterDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.meterWrite.detail(id);
  }

  @Patch("meters/:id")
  @RequirePermission("meter:write")
  @ApiOperation({
    summary: "Sayacı güncelle",
    description:
      "Takılış endeksi (`initialValue`) yalnız **hiç okuma girilmemişken** " +
      "değiştirilebilir; sonrası 400 döner. Değişebilseydi ilk dönemin " +
      "tüketimi geriye dönük değişir, faturası kesilmiş bir tutar sessizce " +
      "başka bir şeye dönüşürdü.",
  })
  updateMeter(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(meterSave)) dto: MeterSave,
  ) {
    return this.meterWrite.save(dto, id);
  }

  /**
   * Dönemsel okuma girişi — **toplu ve tek işlem**.
   *
   * Gerçek iş ayda bir kez binayı dolaşıp bütün sayaçları okumak; sayaç
   * başına ayrı istek 60 daireli bir binada yarım kalmış bir tur demekti.
   */
  @Post("meters/readings/bill")
  @RequirePermission("meter:write")
  @ApiOperation({
    summary: "Dönem tüketimini borçlandır",
    description:
      "Daireye bağlı, tutarı sıfırdan büyük ve borçlandırılmamış okumalar " +
      "için 'utility' borcu açar; okuma borca bağlanır ve kilitlenir.",
  })
  billMeterReadings(@Body(new ZodBodyPipe(meterBill)) dto: MeterBill) {
    return this.meterWrite.bill(dto);
  }

  @Patch("meters/readings/:id")
  @RequirePermission("meter:write")
  @ApiOperation({
    summary: "Okumayı düzelt (gerekçeli)",
    description: "Borçlandırılmış okuma düzeltilemez (409).",
  })
  correctMeterReading(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(meterReadingCorrect)) dto: MeterReadingCorrect,
  ) {
    return this.meterWrite.correctReading(id, dto);
  }

  @Delete("meters/readings/:id")
  @RequirePermission("meter:write")
  @ApiOperation({
    summary: "Okumayı sil (gerekçeli)",
    description: "Borçlandırılmış okuma silinemez (409).",
  })
  removeMeterReading(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(meterReadingRemove)) dto: MeterReadingRemove,
  ) {
    return this.meterWrite.removeReading(id, dto.reason);
  }

  @Post("meters/readings")
  @RequirePermission("meter:write")
  @ApiOperation({
    summary: "Dönemsel sayaç okuması gir (toplu)",
    description:
      "Önceki endeks, tüketim, tutar ve anomali işareti **sunucuda** " +
      "hesaplanır. Aynı dönemde okuma varsa varsayılan davranış atlamaktır " +
      "(`overwrite: false`): bir turu yenileme/çift tıklama ile ikinci kez " +
      "göndermek geçmişi sessizce değiştirmemeli.",
  })
  recordMeterReadings(
    @Body(new ZodBodyPipe(meterReadingBatch)) dto: MeterReadingBatch,
  ) {
    return this.meterWrite.recordBatch(dto);
  }

  @Delete("meters/:id")
  @RequirePermission("meter:write")
  @ApiOperation({
    summary: "Sayacı kaldır (yalnız hatalı kayıt için)",
    description:
      "Sökülen sayaç için doğru işlem `isActive: false`. Sert silme, " +
      "okumaları da (cascade) götürürdü ve o kayıtlar kesilmiş faturaların " +
      "dayanağı.",
  })
  deleteMeter(@Param("id", ParseUUIDPipe) id: string) {
    return this.meterWrite.remove(id);
  }
}
