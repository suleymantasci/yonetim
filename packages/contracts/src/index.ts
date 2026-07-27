/**
 * `@yonetim/contracts` — istemci ve sunucu arasındaki tek doğruluk kaynağı.
 *
 * Nest DTO'su, OpenAPI şeması, Next form doğrulaması ve tipli fetch istemcisi
 * hepsi buradaki **aynı** Zod nesnesinden türer. Codegen adımı yok: monorepo
 * içinde iki taraf da TypeScript (MIMARI-PLAN §7).
 */
export * from "./_shared/index";
export * from "./property/index";
export * from "./finance/index";
export * from "./identity/index";
export * from "./insight/index";
export * from "./governance/index";
