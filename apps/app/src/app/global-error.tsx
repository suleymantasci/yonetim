"use client";

import { useEffect } from "react";

/**
 * Kök hata sınırı — kabuk bile render edilemediğinde (layout hatası,
 * çeviri yükleme hatası) devreye girer.
 *
 * Bu bileşen kendi `<html>`/`<body>` etiketlerini basmak zorundadır ve
 * çeviri altyapısına güvenemez: hatanın kaynağı çeviri katmanı olabilir.
 * Bu yüzden metinler burada **kasıtlı olarak** gömülü ve tek dillidir
 * (varsayılan dil TR); tasarım token'ları da yüklenmemiş olabileceği için
 * satır içi stil kullanılır.
 */
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("[global]", error);
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          padding: "1.5rem",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
            Uygulama başlatılamadı
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "#475569" }}>
            Beklenmeyen bir hata oluştu. Sayfayı yenilemeyi deneyin; sorun sürerse
            aşağıdaki referans kodunu destek ekibine iletin.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: "0.75rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "#64748b",
              }}
            >
              Referans: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              height: "2.5rem",
              padding: "0 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#0f4c81",
              color: "#ffffff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </main>
      </body>
    </html>
  );
}
