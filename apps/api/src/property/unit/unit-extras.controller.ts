import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import {
  householdCreate,
  normalizePlate,
  vehicleCreate,
  type HouseholdCreate,
  type UnitExtras,
  type VehicleCreate,
  type VehicleSearch,
} from "@yonetim/contracts";
import { householdMembers, unitVehicles, units } from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { RequirePermission } from "../../identity/decorators";
import { DbService } from "../../infra/db/db.service";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import type { Database } from "./types";

/**
 * Daire kartının hane halkı ve araç bölümü.
 *
 * Hane halkı kişisel veri: yazma `resident:write`, okuma `unit:read`.
 * Plaka site içinde tekil — aynı plakayı ikinci daireye yazmak 409; kapı
 * görevlisi plakadan daireyi bulabilsin (`vehicles?plate=`).
 */
@Injectable()
export class UnitExtrasService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async get(unitId: string): Promise<UnitExtras> {
    return this.db.tx(async (tx) => {
      await assertUnit(tx, unitId);
      const [household, vehicles] = await Promise.all([
        tx.select().from(householdMembers).where(eq(householdMembers.unitId, unitId)).orderBy(asc(householdMembers.createdAt)),
        tx.select().from(unitVehicles).where(eq(unitVehicles.unitId, unitId)).orderBy(asc(unitVehicles.plate)),
      ]);
      return {
        household: household.map((h) => ({
          id: h.id,
          fullName: h.fullName,
          relation: h.relation as UnitExtras["household"][number]["relation"],
          birthYear: h.birthYear,
          phone: h.phone,
          note: h.note,
        })),
        vehicles: vehicles.map((v) => ({ id: v.id, plate: v.plate, description: v.description, ownerName: v.ownerName })),
      };
    });
  }

  async addMember(unitId: string, dto: HouseholdCreate): Promise<{ id: string }> {
    const id = await this.db.tx(async (tx) => {
      await assertUnit(tx, unitId);
      const [row] = await tx
        .insert(householdMembers)
        .values({
          tenantId: this.db.ctx().tenantId,
          unitId,
          fullName: dto.fullName,
          relation: dto.relation,
          birthYear: dto.birthYear ?? null,
          phone: dto.phone || null,
          note: dto.note || null,
        })
        .returning({ id: householdMembers.id });
      return row!.id;
    });
    await this.audit.record({ action: "household_member_added", resource: "unit", resourceId: unitId });
    return { id };
  }

  async removeMember(unitId: string, id: string): Promise<{ id: string }> {
    const removed = await this.db.tx((tx) =>
      tx
        .delete(householdMembers)
        .where(and(eq(householdMembers.id, id), eq(householdMembers.unitId, unitId)))
        .returning({ id: householdMembers.id }),
    );
    if (removed.length === 0) throw new NotFoundException("not_found");
    await this.audit.record({ action: "household_member_removed", resource: "unit", resourceId: unitId });
    return { id };
  }

  async addVehicle(unitId: string, dto: VehicleCreate): Promise<{ id: string }> {
    const id = await this.db.tx(async (tx) => {
      await assertUnit(tx, unitId);
      const [dup] = await tx.select({ id: unitVehicles.id }).from(unitVehicles).where(eq(unitVehicles.plate, dto.plate)).limit(1);
      if (dup) throw new ConflictException("conflict:plate_taken");
      const [row] = await tx
        .insert(unitVehicles)
        .values({
          tenantId: this.db.ctx().tenantId,
          unitId,
          plate: dto.plate,
          description: dto.description || null,
          ownerName: dto.ownerName || null,
        })
        .returning({ id: unitVehicles.id });
      return row!.id;
    });
    await this.audit.record({ action: "vehicle_added", resource: "unit", resourceId: unitId, diff: { plate: { from: null, to: dto.plate } } });
    return { id };
  }

  async removeVehicle(unitId: string, id: string): Promise<{ id: string }> {
    const removed = await this.db.tx((tx) =>
      tx
        .delete(unitVehicles)
        .where(and(eq(unitVehicles.id, id), eq(unitVehicles.unitId, unitId)))
        .returning({ id: unitVehicles.id }),
    );
    if (removed.length === 0) throw new NotFoundException("not_found");
    await this.audit.record({ action: "vehicle_removed", resource: "unit", resourceId: unitId });
    return { id };
  }

  async searchVehicles(plate: string): Promise<VehicleSearch> {
    const needle = normalizePlate(plate);
    if (needle.length < 2) return { rows: [] };
    const rows = await this.db.tx((tx) =>
      tx.execute(sql`
        SELECT v.id, v.plate, v.description, v.owner_name, u.id AS unit_id,
               CASE WHEN b.name IS NULL THEN u.number ELSE b.name || ' / ' || u.number END AS unit_label
        FROM unit_vehicles v JOIN units u ON u.id = v.unit_id LEFT JOIN blocks b ON b.id = u.block_id
        WHERE u.deleted_at IS NULL AND v.plate LIKE ${`%${needle}%`}
        ORDER BY v.plate LIMIT 20
      `),
    );
    return {
      rows: (rows as unknown as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        plate: String(r.plate),
        description: r.description ? String(r.description) : null,
        ownerName: r.owner_name ? String(r.owner_name) : null,
        unitId: String(r.unit_id),
        unitLabel: String(r.unit_label),
      })),
    };
  }
}

async function assertUnit(tx: Database, unitId: string) {
  const [unit] = await tx.select({ id: units.id }).from(units).where(and(eq(units.id, unitId), isNull(units.deletedAt))).limit(1);
  if (!unit) throw new NotFoundException("not_found:unit");
}

@ApiTags("panel/units")
@Controller("v1/panel/units")
export class UnitExtrasController {
  constructor(private readonly service: UnitExtrasService) {}

  @Get("vehicles")
  @RequirePermission("unit:read")
  @ApiOperation({ summary: "Plakadan daire bul" })
  search(@Query("plate") plate = "") {
    return this.service.searchVehicles(plate);
  }

  @Get(":id/extras")
  @RequirePermission("unit:read")
  @ApiOperation({ summary: "Daire kartı: hane halkı ve araçlar" })
  extras(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post(":id/household")
  @RequirePermission("resident:write")
  addMember(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodBodyPipe(householdCreate)) dto: HouseholdCreate) {
    return this.service.addMember(id, dto);
  }

  @Delete(":id/household/:memberId")
  @RequirePermission("resident:write")
  removeMember(@Param("id", ParseUUIDPipe) id: string, @Param("memberId", ParseUUIDPipe) memberId: string) {
    return this.service.removeMember(id, memberId);
  }

  @Post(":id/vehicles")
  @RequirePermission("unit:write")
  addVehicle(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodBodyPipe(vehicleCreate)) dto: VehicleCreate) {
    return this.service.addVehicle(id, dto);
  }

  @Delete(":id/vehicles/:vehicleId")
  @RequirePermission("unit:write")
  removeVehicle(@Param("id", ParseUUIDPipe) id: string, @Param("vehicleId", ParseUUIDPipe) vehicleId: string) {
    return this.service.removeVehicle(id, vehicleId);
  }
}
