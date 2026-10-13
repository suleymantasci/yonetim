"use client";

import { useEffect } from "react";

/**
 * Dijital Asistan'ın tek satırlık script'i — kurulum değerleri `/api/dijital-asistan`
 * ucundan çalışma anında alınır (bkz. o dosyadaki not). Asistanın kodu burada yok.
 */
export function AssistantScript() {
  useEffect(() => {
    let script: HTMLScriptElement | null = null;
    let installation = "";
    const controller = new AbortController();
    fetch("/api/dijital-asistan", { signal: controller.signal })
      .then((response) => response.json() as Promise<{ enabled: boolean; src?: string; installation?: string; verification?: string }>)
      .then((config) => {
        if (!config.enabled || !config.src || !config.installation || !config.verification) return;
        installation = config.installation;
        script = document.createElement("script");
        script.src = config.src;
        script.defer = true;
        script.dataset.installation = config.installation;
        script.dataset.verification = config.verification;
        document.body.appendChild(script);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (installation) (window as { DijitalAsistan?: { remove(key: string): void } }).DijitalAsistan?.remove(installation);
      script?.remove();
    };
  }, []);
  return null;
}
