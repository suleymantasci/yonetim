"use client";

import { useEffect } from "react";

/**
 * Dijital Asistan'ın tek satırlık script'i — asistanın kendi kodu Vekil'de yok.
 *
 * Script, genel sitelerdekiyle aynı (`embed.js`); veriyi `/v1/dijital-asistan`
 * uçlarından kullanıcının oturumuyla alır. Elle ekleniyor çünkü panel
 * yerleşimi istemci tarafında yeniden kurulabiliyor (giriş, site değiştirme):
 * her kurulumda temiz başlasın, çıkışta widget sayfada kalmasın.
 */
export function AssistantScript({ src, installation, verification }: { src: string; installation: string; verification: string }) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.installation = installation;
    script.dataset.verification = verification;
    document.body.appendChild(script);
    return () => {
      (window as { DijitalAsistan?: { remove(key: string): void } }).DijitalAsistan?.remove(installation);
      script.remove();
    };
  }, [src, installation, verification]);
  return null;
}
