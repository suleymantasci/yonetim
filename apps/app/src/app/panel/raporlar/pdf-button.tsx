"use client";

import { FileDown } from "lucide-react";

const CLS =
  "inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover print:hidden";

/**
 * Sekmenin PDF'i — sunucuda üretilir, yeni sekmede açılır.
 *
 * Notlu raporlarda (faaliyet, denetim) ekranda yazılan metin kaydedilmiyor;
 * PDF'e girsin diye `data-pdf-note` alanları POST gövdesiyle gönderiliyor.
 * Notsuz raporlar düz bağlantı: JS olmadan da çalışır, adres paylaşılabilir.
 */
export function PdfButton({
  href,
  label,
  title,
  withNotes = false,
}: {
  href: string;
  label: string;
  title: string;
  withNotes?: boolean;
}) {
  if (!withNotes) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        title={title}
        className={CLS}
      >
        <FileDown aria-hidden className="h-4 w-4" />
        {label}
      </a>
    );
  }
  const submit = () => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = href;
    form.target = "_blank";
    document.querySelectorAll<HTMLElement>("[data-pdf-note]").forEach((el) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = el.dataset.pdfNote!;
      input.value = el.innerText;
      form.append(input);
    });
    document.body.append(form);
    form.submit();
    form.remove();
  };
  return (
    <button type="button" onClick={submit} title={title} className={CLS}>
      <FileDown aria-hidden className="h-4 w-4" />
      {label}
    </button>
  );
}
