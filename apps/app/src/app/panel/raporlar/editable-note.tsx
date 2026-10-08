"use client";

/**
 * Yazdırılacak rapordaki serbest metin alanı. Kaydedilmiyor: rapor her
 * açılışta güncel rakamlarla yeniden üretiliyor; yorum, imzaya giden çıktıya
 * yazılıyor. Ekranda kesik çizgili kutu, çıktıda düz metin.
 */
export function EditableNote({
  name,
  placeholder,
  minLines = 3,
}: {
  /** PDF'e taşınırken alan adı (`PdfButton withNotes`). */
  name: string;
  placeholder: string;
  minLines?: number;
}) {
  return (
    <div
      contentEditable
      data-pdf-note={name}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      data-placeholder={placeholder}
      style={{ minHeight: `${minLines * 1.5}rem` }}
      className="whitespace-pre-wrap rounded-lg border border-dashed border-border-strong p-3 text-sm leading-relaxed text-fg outline-none empty:before:text-fg-subtle empty:before:content-[attr(data-placeholder)] focus:border-primary print:border-0 print:p-0 print:empty:before:content-none"
    />
  );
}
