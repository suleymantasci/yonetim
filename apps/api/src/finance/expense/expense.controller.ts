import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  expenseCategorySave,
  expenseDistribute,
  expenseIds,
  expenseListQuery,
  expenseSave,
  expenseStatusPatch,
  type ExpenseCategorySave,
  type ExpenseDistribute,
  type ExpenseListQuery,
  type ExpenseSave,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe, ZodQueryPipe } from "../../infra/zod/zod-dto";
import { ExpenseService } from "./expense.service";

/** Panel iç BFF yüzeyi — `/v1/panel/expenses`. */
@ApiTags("panel/expenses")
@Controller("v1/panel/expenses")
export class ExpenseController {
  constructor(private readonly service: ExpenseService) {}

  @Get()
  @RequirePermission("expense:read")
  list(@Query(new ZodQueryPipe(expenseListQuery)) q: ExpenseListQuery) {
    return this.service.list(q);
  }

  @Get("categories")
  @RequirePermission("expense:read")
  categories() {
    return this.service.categoryTree();
  }

  @Post("categories")
  @RequirePermission("expense:write")
  saveCategory(
    @Body(new ZodBodyPipe(expenseCategorySave)) dto: ExpenseCategorySave,
  ) {
    return this.service.saveCategory(dto);
  }

  @Delete("categories/:id")
  @RequirePermission("expense:write")
  @ApiOperation({
    summary: "Kategori arşivleme",
    description:
      "Altında gider veya alt kategori varsa silinmez, **pasifleştirilir**: " +
      "geçmiş gider kayıtlarının kategorisini kopartmak raporları bozardı.",
  })
  archiveCategory(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.archiveCategory(id);
  }

  @Post("allocation/preview")
  @RequirePermission("expense:read")
  previewDistribution(
    @Body(new ZodBodyPipe(expenseDistribute)) dto: ExpenseDistribute,
  ) {
    return this.service.previewDistribution(dto);
  }

  @Post("allocation")
  @RequirePermission("expense:approve")
  @ApiOperation({
    summary: "Gideri dairelere borç olarak yansıt",
    description:
      "`confirmed: false` ise 400 `preview_required`. Bir gider yalnız bir kez " +
      "dağıtılabilir; ikinci deneme 409 `conflict` döner.",
  })
  distribute(
    @Body(new ZodBodyPipe(expenseDistribute)) dto: ExpenseDistribute,
    // Üretilen borçların açıklaması kullanıcının dilinde olmalı; API dile
    // bağımsız kaldığı için **etiketi** panel gönderiyor (SPEC 4.2), giderin
    // kendi açıklamasını sunucu ekliyor.
    @Headers("x-debt-description") label?: string,
  ) {
    return this.service.distribute(dto, decodeDescription(label));
  }

  @Patch("status")
  @RequirePermission("expense:approve")
  setStatus(
    @Body(new ZodBodyPipe(expenseStatusPatch))
    dto: {
      ids: string[];
      status: "approved" | "rejected" | "paid";
    },
  ) {
    return this.service.setStatus(dto.ids, dto.status);
  }

  @Post("trash")
  @RequirePermission("expense:write")
  softDelete(@Body(new ZodBodyPipe(expenseIds)) dto: { ids: string[] }) {
    return this.service.softDelete(dto.ids);
  }

  @Get(":id")
  @RequirePermission("expense:read")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Post()
  @RequirePermission("expense:write")
  save(@Body(new ZodBodyPipe(expenseSave)) dto: ExpenseSave) {
    return this.service.save(dto);
  }
}

function decodeDescription(raw: string | undefined): string {
  if (!raw) return "daire payı";
  try {
    return decodeURIComponent(raw).slice(0, 80);
  } catch {
    return raw.slice(0, 80);
  }
}
