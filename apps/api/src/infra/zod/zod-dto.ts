import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodError, type ZodTypeAny, type z } from "zod";

/**
 * Zod → Nest doğrulama köprüsü.
 *
 * `nestjs-zod`'un `ZodValidationPipe`'ı `createZodDto` ile üretilmiş sınıflar
 * bekliyor; bizim şemalarımız `packages/contracts` içinde **düz Zod nesneleri**
 * olarak duruyor (istemci tarafı da onları import ediyor, sınıf sarmalayıcı
 * oraya taşınamaz). Bu ince pipe aradaki farkı kapatıyor.
 *
 * Hata `ZodError` olarak fırlıyor; `ApiExceptionFilter` onu tek hata zarfına
 * (`validation_failed` + `flatten()` ayrıntısı) çeviriyor.
 */
export class ZodQueryPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    try {
      return this.schema.parse(value ?? {});
    } catch (error) {
      if (error instanceof ZodError) throw error;
      throw new BadRequestException("validation_failed");
    }
  }
}

/** Gövde ve sorgu için aynı davranış; ayrı isim okunabilirlik içindir. */
export const ZodBodyPipe = ZodQueryPipe;
