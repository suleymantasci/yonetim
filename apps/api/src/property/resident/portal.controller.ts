import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  portalCommentCreate,
  portalMessageCreate,
  portalPhoneChangeStart,
  portalPhoneChangeVerify,
  portalProfileUpdate,
  portalRequestCreate,
  portalVoteCreate,
  type PortalAnnouncementsResponse,
  type PortalCommentCreate,
  type PortalDebtsResponse,
  type PortalManagement,
  type PortalMessageCreate,
  type PortalMessagesResponse,
  type PortalPaymentsResponse,
  type PortalPhoneChangeResult,
  type PortalPhoneChangeStart,
  type PortalPhoneChangeVerify,
  type PortalPollsResponse,
  type PortalProfile,
  type PortalProfileUpdate,
  type PortalRequestCreate,
  type PortalRequestDetail,
  type PortalRequestsResponse,
  type PortalSummary,
  type PortalVoteCreate,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { PortalService } from "./portal.service";

/**
 * Sakin self-servis portalı — `/v1/panel/portal/*` (SPEC Faz 2 / Bölüm 6.1).
 *
 * İZİNLER NEDEN `*_own`: sakinin `debt:read` ya da `message:read` izni yok ve
 * olmamalı; o izinler site genelindeki yönetim uçlarını açar. Sakine "kendi
 * borcunu görsün" derken tüm sitenin borcunu açmamak için ayrı izin adları
 * kullanılıyor (`packages/core/src/rbac.ts` RESIDENT_BASE).
 *
 * Kapsam ayrıca **sorguyla** da daraltılıyor: servis hiçbir metotta dışarıdan
 * `unitId`/`userId` almıyor, hepsini oturumdan çözüyor. İzin ile sorgu
 * birbirinin yedeği — biri unutulursa diğeri hâlâ tutuyor.
 */
@ApiTags("panel/portal")
@Controller("v1/panel/portal")
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Get("me")
  @RequirePermission("debt:read_own")
  @ApiOperation({
    summary: "Sakin ana ekranı — borç özeti, sıradaki vade ve duyurular",
  })
  summary(): Promise<PortalSummary> {
    return this.service.summary();
  }

  @Get("debts")
  @RequirePermission("debt:read_own")
  @ApiOperation({
    summary: "Kendi borç dökümüm",
    description:
      "Düzeltmeler yalnız `visible_to_resident` olanlar; yönetimin iç notu " +
      "niteliğindeki değişiklikler dönmez.",
  })
  debts(): Promise<PortalDebtsResponse> {
    return this.service.debts();
  }

  @Get("payments")
  @RequirePermission("payment:read_own")
  @ApiOperation({ summary: "Kendi ödeme geçmişim" })
  payments(): Promise<PortalPaymentsResponse> {
    return this.service.payments();
  }

  @Get("requests")
  @RequirePermission("request:read_own")
  @ApiOperation({ summary: "Kendi taleplerim" })
  requests(): Promise<PortalRequestsResponse> {
    return this.service.requests();
  }

  @Get("requests/:id")
  @RequirePermission("request:read_own")
  @ApiOperation({
    summary: "Talep detayı ve yazışma",
    description:
      "Başkasının talebi 404 döner — 403 dönmek kaydın varlığını sızdırırdı. " +
      "`is_internal` yorumlar listede yer almaz.",
  })
  requestDetail(@Param("id", ParseUUIDPipe) id: string): Promise<PortalRequestDetail> {
    return this.service.requestDetail(id);
  }

  @Post("requests")
  @RequirePermission("request:write")
  @ApiOperation({
    summary: "Talep aç",
    description: "Talep kodu ve daire bağlantısı sunucuda üretilir.",
  })
  createRequest(
    @Body(new ZodBodyPipe(portalRequestCreate)) dto: PortalRequestCreate,
  ) {
    return this.service.createRequest(dto);
  }

  @Post("requests/:id/comments")
  @RequirePermission("request:write")
  @ApiOperation({ summary: "Talebe yorum ekle" })
  addComment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(portalCommentCreate)) dto: PortalCommentCreate,
  ) {
    return this.service.addComment(id, dto);
  }

  @Get("messages")
  @RequirePermission("message:read_own")
  @ApiOperation({
    summary: "Yönetimle yazışmam",
    description:
      "Yönetim ucunun (`/v1/panel/communication/messages`) aksine yalnız " +
      "oturumdaki kullanıcının mesajlarını döndürür.",
  })
  messages(): Promise<PortalMessagesResponse> {
    return this.service.messages();
  }

  @Post("messages")
  @RequirePermission("message:write")
  @ApiOperation({ summary: "Yönetime mesaj gönder" })
  sendMessage(
    @Body(new ZodBodyPipe(portalMessageCreate)) dto: PortalMessageCreate,
  ) {
    return this.service.sendMessage(dto);
  }

  @Get("profile")
  @RequirePermission("unit:read")
  @ApiOperation({
    summary: "Bilgilerim — kişisel kayıt ve bağımsız bölüm ilişkileri",
    description: "TCKN ve telefon maskeli döner; kendi kaydında da ham değer verilmez.",
  })
  profile(): Promise<PortalProfile> {
    return this.service.profile();
  }

  @Patch("profile")
  @RequirePermission("unit:read")
  @ApiOperation({
    summary: "Bilgilerimi güncelle",
    description:
      "Telefon bu uçtan değişmez: numara oturum kimliğinin kendisi (OTP " +
      "oraya gidiyor), doğrulamasız değişiklik hesabı devretmenin yolu olurdu.",
  })
  updateProfile(
    @Body(new ZodBodyPipe(portalProfileUpdate)) dto: PortalProfileUpdate,
  ) {
    return this.service.updateProfile(dto);
  }

  @Post("profile/phone")
  @RequirePermission("unit:read")
  @ApiOperation({
    summary: "Telefon değişikliği başlat — yeni numaraya doğrulama kodu",
    description:
      "Yanıt her durumda `sent: true`: numara başkasına ait olsa da farklı " +
      "cevap vermek, oturum açmış birine 'şu numara kayıtlı mı' sorusunu " +
      "sordururdu. Sahiplik doğrulama adımında bağlanıyor.",
  })
  startPhoneChange(
    @Body(new ZodBodyPipe(portalPhoneChangeStart)) dto: PortalPhoneChangeStart,
  ): Promise<PortalPhoneChangeResult> {
    return this.service.startPhoneChange(dto);
  }

  @Post("profile/phone/verify")
  @RequirePermission("unit:read")
  @ApiOperation({
    summary: "Telefon değişikliğini kodla onayla",
    description:
      "Kod tek kullanımlık ve amacı ayrı (`phone_change`): giriş için " +
      "gönderilen bir OTP burada geçmez. Numara platform genelinde tekil; " +
      "başkasına aitse `phone_taken` döner.",
  })
  confirmPhoneChange(
    @Body(new ZodBodyPipe(portalPhoneChangeVerify)) dto: PortalPhoneChangeVerify,
  ) {
    return this.service.confirmPhoneChange(dto);
  }

  @Get("management")
  @RequirePermission("tenant:read")
  @ApiOperation({
    summary: "Yönetim bilgileri — yönetici, banka hesapları, personel",
    description:
      "Yöneticinin iletişim bilgisi KMK md.34 gereği kat maliklerine açıktır; " +
      "IBAN yine de maskeli döner (yönetim ekranıyla aynı çizgi).",
  })
  management(): Promise<PortalManagement> {
    return this.service.management();
  }

  @Get("announcements")
  @RequirePermission("announcement:read")
  @ApiOperation({ summary: "Yayınlanmış ve süresi dolmamış duyurular" })
  announcements(): Promise<PortalAnnouncementsResponse> {
    return this.service.announcements();
  }

  @Get("polls")
  @RequirePermission("poll:read")
  @ApiOperation({
    summary: "Oylamalar — oy durumum ve kapanmışların sonucu",
    description:
      "Açık oylamanın ara sonucu **dönmez**: sonradan oy verecekleri " +
      "etkilerdi. `blockedReason` oy kullanamama sebebini söyler; ekran " +
      "sadece düğmeyi gizlemek yerine nedenini yazabilsin diye.",
  })
  polls(): Promise<PortalPollsResponse> {
    return this.service.polls();
  }

  @Post("polls/:id/vote")
  @RequirePermission("poll:vote")
  @ApiOperation({
    summary: "Oy kullan",
    description:
      "Daire başına bir oy; tekillik veritabanı kısıtıyla da garanti " +
      "altında. Ağırlık sunucuda hesaplanır (arsa payı modunda dairenin " +
      "payı), istemciden alınmaz. Çoklu seçimde ağırlık seçenekler arasında " +
      "bölünür — kopyalansaydı 'hepsini seç' bir oy hilesi olurdu.",
  })
  vote(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(portalVoteCreate)) dto: PortalVoteCreate,
  ) {
    return this.service.vote(id, dto);
  }
}
