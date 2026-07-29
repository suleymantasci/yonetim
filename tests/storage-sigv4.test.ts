import { describe, expect, it } from "vitest";

import { presignUrl, rfc3986 } from "../packages/storage/src/sigv4";

/**
 * SigV4 imzası — AWS'in **kendi** belgelerindeki örnekle doğrulanıyor.
 *
 * NEDEN BU ÖNEMLİ: imza algoritmasını elle yazdık (SDK yerine). Yanlış
 * yazılmış bir imza yerel testte fark edilmez, ancak gerçek bir yükleme
 * denemesinde `SignatureDoesNotMatch` olarak çıkar — yani ilk kez kullanıcı
 * bir belge yüklemeye çalıştığında. AWS'in yayımladığı örnek (Signature
 * Version 4, "GET Object — query parameters" bölümü) bu riski ortadan
 * kaldırıyor: aynı girdilerle aynı imzayı üretiyorsak algoritma doğru.
 */
describe("AWS SigV4 imzalı URL", () => {
  const VECTOR = {
    method: "GET",
    endpoint: "https://examplebucket.s3.amazonaws.com",
    path: "test.txt",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    expiresInSeconds: 86_400,
    now: new Date("2013-05-24T00:00:00Z"),
  } as const;

  it("AWS belgelerindeki örnekle aynı imzayı üretiyor", () => {
    const url = presignUrl({ ...VECTOR });
    expect(url).toContain(
      "X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("zorunlu sorgu parametrelerinin hepsi var ve kapsam doğru", () => {
    const url = new URL(presignUrl({ ...VECTOR }));
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    );
    expect(url.searchParams.get("X-Amz-Date")).toBe("20130524T000000Z");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("anahtarın içindeki bölü korunuyor, boşluk kodlanıyor", () => {
    // `/` kodlansaydı dosya "klasör" adının parçası olur, başka bir yere
    // yazılırdı; boşluk kodlanmasaydı imza hiç tutmazdı.
    const url = presignUrl({ ...VECTOR, path: "kova/2026/kat planı.pdf" });
    expect(url).toContain("/kova/2026/kat%20plan%C4%B1.pdf?");
  });

  it("farklı anahtar farklı imza üretiyor", () => {
    const a = presignUrl({ ...VECTOR });
    const b = presignUrl({ ...VECTOR, path: "baska.txt" });
    expect(a).not.toBe(b);
  });

  it("rfc3986 encodeURIComponent'in atladığı karakterleri de kodluyor", () => {
    expect(rfc3986("a!'()*b")).toBe("a%21%27%28%29%2Ab");
  });
});
