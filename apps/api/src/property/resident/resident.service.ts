import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type {
  EmergencyReport,
  OccupancyCreate,
  OccupancyEnd,
  OccupancyEndResult,
  ResidentCreate,
  ResidentDetail,
  ResidentEditForm,
  ResidentListQuery,
  ResidentListResponse,
  ResidentRemoveResult,
  ResidentSaveResult,
  ResidentUpdate,
  TcknLookupResult,
} from "@yonetim/contracts";
import { maskPhone } from "@yonetim/core";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";
import { PiiService } from "./pii.service";
import { ResidentWriteRepository } from "./resident-write.repository";
import { ResidentRepository } from "./resident.repository";

/**
 * Sakin iş akışı — MIMARI-PLAN §8.5.
 *
 * İki sorumluluğu var ve ikisi de buraya ait olmak zorunda:
 *
 *  1. **Maskeleme** (§9.1). Ham telefon ve şifreli TCKN bu sınırı geçmez.
 *     Maskelemeyi controller'a ya da app'e bıraksaydık, bir uç unutulduğunda
 *     sızıntı olurdu; burada yapıldığında sözleşmenin tipi (`phoneMasked`)
 *     zaten başka türlüsüne izin vermiyor.
 *  2. **KVKK erişim kaydı** (§8.4). Kayıt **dönen kümeyle** yazılıyor:
 *     sayfalama sunucuda olduğu için kütükteki küme ekrandaki kümeyle
 *     birebir. Eskiden bunu `page.tsx` bir döngüyle yazıyordu; API'nin 50,
 *     ekranın 12 kişi gösterdiği durumlar oradan doğuyordu.
 */
@Injectable()
export class ResidentService {
  constructor(
    private readonly repo: ResidentRepository,
    private readonly write: ResidentWriteRepository,
    private readonly pii: PiiService,
    private readonly audit: AuditService,
    private readonly db: DbService,
  ) {}

  async list(q: ResidentListQuery): Promise<ResidentListResponse> {
    const data = await this.repo.list(q);

    await this.audit.recordDataAccess({
      subjectUserIds: data.rows.map((row) => row.userId),
      dataCategory: "iletisim_bilgisi",
      action: "view",
      purpose: "resident.list",
    });

    return {
      rows: data.rows.map((row) => ({
        userId: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        phoneMasked: row.phone ? maskPhone(row.phone) : null,
        email: row.email,
        whatsappOptIn: row.whatsappOptIn,
        hasTckn: row.hasTckn,
        roles: row.roles,
        occupancies: row.occupancies,
        outstandingMinor: row.outstandingMinor,
        overdueMinor: row.overdueMinor,
      })),
      meta: {
        page: q.page,
        perPage: q.perPage,
        total: data.total,
        pageCount: Math.max(1, Math.ceil(data.total / q.perPage)),
      },
      facets: {
        blocks: data.blocks.map((block) => ({
          id: block.id,
          label: block.name,
        })),
      },
      totals: data.totals,
    };
  }

  async detail(userId: string): Promise<ResidentDetail> {
    const data = await this.repo.detail(userId);
    if (!data) throw new NotFoundException("not_found");

    const { scoped, person, consentRows, otherDebtors } = data;
    const tenantId = this.db.ctx().tenantId;

    await this.audit.recordDataAccess({
      subjectUserIds: [userId],
      dataCategory: "kimlik_bilgisi",
      action: "view",
      purpose: "resident.detail",
    });
    // Detay kartı kan grubunu da gösteriyor; dolu olduğunda bu bir sağlık
    // verisi görüntülemesi ve ayrı kategoriyle kütüğe geçmeli (bkz. editForm).
    if (person.bloodType) {
      await this.audit.recordDataAccess({
        subjectUserIds: [userId],
        dataCategory: "saglik_bilgisi",
        action: "view",
        purpose: "resident.detail",
      });
    }

    return {
      userId: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      phoneMasked: person.phone ? maskPhone(person.phone) : null,
      email: person.email,
      locale: person.locale,
      whatsappOptIn: person.whatsappOptIn,
      whatsappOptInAt: person.whatsappOptInAt,
      // Çözme burada ve yalnız burada; dışarı yalnız maske çıkıyor.
      tcknMasked: this.pii.revealTcknMasked(person.tcknEncrypted, tenantId),
      emergencyContactName: person.emergencyContactName,
      emergencyContactPhoneMasked: person.emergencyContactPhone
        ? maskPhone(person.emergencyContactPhone)
        : null,
      bloodType: person.bloodType,
      createdAt: person.createdAt,
      lastLoginAt: person.lastLoginAt,
      roles: scoped.memberRows.map((row) => row.role),
      notes: scoped.memberRows.find((row) => row.notes)?.notes ?? null,
      occupancies: scoped.occupancyRows,
      balance: {
        outstandingMinor: Number(scoped.balanceRow?.outstanding ?? 0),
        overdueMinor: Number(scoped.balanceRow?.overdue ?? 0),
        paidTotalMinor: Number(scoped.paidRow?.total ?? 0),
      },
      debts: scoped.debtRows,
      payments: scoped.paymentRows.map((row) => {
        const other =
          row.debtorUserId && row.debtorUserId !== userId
            ? otherDebtors.find((d) => d.id === row.debtorUserId)
            : undefined;
        return {
          id: row.id,
          amountMinor: row.amountMinor,
          method: row.method,
          status: row.status,
          paidAt: row.paidAt,
          receiptNo: row.receiptNo,
          onBehalfOf: other
            ? [other.firstName, other.lastName].filter(Boolean).join(" ")
            : null,
        };
      }),
      consents: consentRows.map((row) => ({
        kind: row.kind,
        granted: row.granted,
        documentVersion: row.documentVersion,
        at: row.grantedAt ?? row.revokedAt ?? row.createdAt,
      })),
    };
  }

  /**
   * Düzenleme formu ön dolgusu.
   *
   * Ham telefon dönen tek okuma ucu; bu yüzden `resident:write` istiyor ve
   * ayrı bir amaçla kütüğe yazılıyor. "Kim listeye baktı" ile "kim düzenlemek
   * için ham numarayı gördü" KVKK açısından farklı olaylar.
   */
  async editForm(userId: string): Promise<ResidentEditForm> {
    const data = await this.repo.editForm(userId);
    if (!data) throw new NotFoundException("not_found");

    await this.audit.recordDataAccess({
      subjectUserIds: [userId],
      dataCategory: "iletisim_bilgisi",
      action: "view",
      purpose: "resident.edit_form",
    });

    const { person, member, hasHealthConsent } = data;

    // Form kan grubunu da dolduruyor; dolu olduğunda bu bir **sağlık verisi**
    // görüntülemesidir ve ayrı kategoriyle kütüğe geçmeli. Tek satırın
    // kategorisini yükseltmek yerine ikinci satır yazılıyor: "iletişim
    // bilgisi görüldü" olayı da doğru ve kaybolmamalı.
    if (person.bloodType) {
      await this.audit.recordDataAccess({
        subjectUserIds: [userId],
        dataCategory: "saglik_bilgisi",
        action: "view",
        purpose: "resident.edit_form",
      });
    }
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
      email: person.email,
      role: member.role,
      locale: person.locale,
      whatsappOptIn: person.whatsappOptIn,
      emergencyContactName: person.emergencyContactName,
      emergencyContactPhone: person.emergencyContactPhone,
      bloodType: person.bloodType,
      hasHealthConsent,
      notes: member.notes,
      // TCKN'in kendisi değil varlığı: form "kayıtlı" göstergesi için yeterli,
      // boş bırakıldığında mevcut değer korunuyor.
      hasTckn: person.tcknIndex !== null,
    };
  }

  /**
   * Acil durum raporu — GAP 4.1.2 / rakip incelemesi §4.1.
   *
   * Yanıt hem kan grubu (özel nitelikli) hem maskesiz acil durum numarası
   * taşıdığı için erişim **iki** kategoriyle kütüğe geçiyor. `saglik_bilgisi`
   * ayrı tutuluyor ki KVKK ekranında "kim sağlık verisine baktı" sorusu
   * `iletisim_bilgisi` gürültüsüne karışmadan sorulabilsin.
   *
   * Sağlık kategorisi yalnız kan grubu **kayıtlı** kişiler için yazılıyor:
   * verisi olmayan kişi için "sağlık verisine erişildi" demek kütüğü yanlış
   * doldurmak olurdu.
   */
  async emergencyReport(): Promise<EmergencyReport> {
    const rows = await this.repo.emergencyContacts();

    await this.audit.recordDataAccess({
      subjectUserIds: rows.map((row) => row.userId),
      dataCategory: "iletisim_bilgisi",
      action: "view",
      purpose: "resident.emergency_report",
    });
    await this.audit.recordDataAccess({
      subjectUserIds: rows
        .filter((row) => row.bloodType)
        .map((row) => row.userId),
      dataCategory: "saglik_bilgisi",
      action: "view",
      purpose: "resident.emergency_report",
    });

    return {
      rows,
      totals: {
        residents: rows.length,
        withBloodType: rows.filter((row) => row.bloodType).length,
        withEmergencyContact: rows.filter((row) => row.emergencyContactPhone)
          .length,
        missingBoth: rows.filter(
          (row) => !row.bloodType && !row.emergencyContactPhone,
        ).length,
      },
    };
  }

  async options() {
    const rows = await this.repo.options();
    return {
      rows: rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        phoneMasked: row.phone ? maskPhone(row.phone) : null,
      })),
    };
  }

  async create(dto: ResidentCreate): Promise<ResidentSaveResult> {
    // GAP-DURUM kararı 11: aydınlatma onayı olmadan kişisel veri kaydedilmez.
    if (!dto.kvkkAcknowledged)
      throw new BadRequestException("consent_required");

    const result = await this.write.create(dto);

    await this.audit.record({
      action: result.linkedExisting ? "resident_linked" : "resident_created",
      resource: "resident",
      resourceId: result.id,
    });
    await this.audit.recordDataAccess({
      subjectUserIds: [result.id],
      dataCategory: "kimlik_bilgisi",
      action: "update",
      purpose: "resident.create",
    });

    return result;
  }

  async update(dto: ResidentUpdate): Promise<ResidentSaveResult> {
    // `users` RLS dışında olduğu için üyelik kontrolü **yazma öncesi**
    // yapılmalı: aksi halde başka sitenin sakini id'yle düzenlenebilirdi.
    if (!(await this.repo.isMember(dto.id)))
      throw new NotFoundException("not_found");

    const diff = await this.write.update(dto);

    await this.audit.record({
      action: "resident_updated",
      resource: "resident",
      resourceId: dto.id,
      // Kişisel veri diff'te tutuluyor: kütük zaten en yüksek koruma
      // seviyesinde ve KVKK izlenebilirliği "neyin değiştiğini" istiyor.
      diff,
    });
    await this.audit.recordDataAccess({
      subjectUserIds: [dto.id],
      dataCategory: "kimlik_bilgisi",
      action: "update",
      purpose: "resident.update",
    });

    return { id: dto.id, linkedExisting: false };
  }

  async addOccupancy(dto: OccupancyCreate): Promise<{ id: string }> {
    if (!(await this.repo.isMember(dto.userId)))
      throw new NotFoundException("not_found");
    const id = await this.write.addOccupancy(dto);
    await this.audit.record({
      action: "occupancy_created",
      resource: "unit_occupancy",
      resourceId: id,
    });
    return { id };
  }

  async endOccupancy(
    occupancyId: string,
    dto: OccupancyEnd,
  ): Promise<OccupancyEndResult> {
    const result = await this.write.endOccupancy(occupancyId, dto);
    await this.audit.record({
      action: "occupancy_ended",
      resource: "unit_occupancy",
      resourceId: occupancyId,
      // Devir kararının ne olduğu ve neyi taşıdığı kütükte okunur olmalı:
      // "kiracı çıktı" ile "kiracı çıktı, 4 borç malike geçti" farklı olaylar.
      reason: `${dto.transferTo}: ${dto.reason ?? "-"} (${result.transferredDebtCount} borç, ${result.transferredMinor} kuruş)`,
    });
    return result;
  }

  async remove(ids: string[]): Promise<ResidentRemoveResult> {
    const result = await this.write.remove(ids);
    await this.audit.record({
      action: "resident_bulk_removed",
      resource: "resident",
      reason: `${result.removed}/${ids.length}`,
    });
    return result;
  }

  async setWhatsappOptIn(
    ids: string[],
    optIn: boolean,
  ): Promise<{ affected: number }> {
    const affected = await this.write.setWhatsappOptIn(ids, optIn);
    await this.audit.record({
      action: optIn ? "resident_whatsapp_opt_in" : "resident_whatsapp_opt_out",
      resource: "resident",
      reason: String(ids.length),
    });
    return { affected };
  }

  async findByTckn(tckn: string): Promise<TcknLookupResult> {
    const found = await this.write.findByTckn(tckn);
    if (!found) return { found: false, id: null, name: null };

    await this.audit.recordDataAccess({
      subjectUserIds: [found.id],
      dataCategory: "kimlik_bilgisi",
      action: "view",
      purpose: "resident.tckn_duplicate_check",
    });
    return { found: true, id: found.id, name: found.name };
  }
}
