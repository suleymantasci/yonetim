import { Module } from "@nestjs/common";

import { IdentityModule } from "../../identity/identity.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

/** Dijital Asistan veri ucu — bkz. docs/entegrasyon/dijital-asistan.md. */
@Module({
  imports: [IdentityModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
