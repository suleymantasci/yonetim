import { Module } from "@nestjs/common";

import { DashboardController } from "./dashboard.controller";
import { DashboardRepository } from "./dashboard.repository";
import { DashboardService } from "./dashboard.service";
import { ShellController } from "./shell.controller";

/**
 * `insight` bağlamı — kontrol paneli, raporlar, simülatör (MIMARI-PLAN §6.3).
 * A4'te kontrol paneli; rapor ve simülatör A5'te eklenir.
 */
@Module({
  controllers: [DashboardController, ShellController],
  providers: [DashboardService, DashboardRepository],
  exports: [DashboardService],
})
export class InsightModule {}
