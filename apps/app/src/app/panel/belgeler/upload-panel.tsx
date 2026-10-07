"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Alert, Input, Select, Spinner, Textarea, useToast } from "@yonetim/ui";

import { createDocument, requestUploadUrl } from "./actions";

const CATEGORIES = [
  "contract", "license", "meeting_minutes", "invoice", "maintenance_report",
  "management_plan", "insurance", "legal", "kvkk", "identity", "other",
] as const;

const VISIBILITIES = ["managers", "owners", "residents"] as const;

/** Sunucudaki `MAX_UPLOAD_BYTES` ile aynı; erken hata için. */
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Belge yükleme — üç adım, ikisi görünmez.
 *
 * 1. Sunucudan imzalı adres iste.
 * 2. Dosyayı **tarayıcıdan doğrudan** R2'ye yaz.
 * 3. Kaydı aç (sunucu nesnenin gerçek boyutunu ve türünü doğrular).
 *
 * NEDEN `ActionForm` DEĞİL: ortadaki adım sunucuda değil tarayıcıda oluyor.
 * Dosyayı bir server action'a vermek Next.js'in onu önce sunucuya taşıması,
 * sonra sunucunun R2'ye yeniden yüklemesi demekti — her yükleme iki kat bant
 * genişliği ve Node sürecinde onlarca megabaytlık bir tampon.
 *
 * OPS NOTU: R2 kovasının CORS ayarında bu alan adına `PUT` izni olmalı;
 * yoksa ikinci adım tarayıcıda düşer ve kullanıcı sebebini göremez.
 */
export function UploadPanel({ enabled }: { enabled: boolean }) {
  const t = useTranslations("app.documents");
  const tEnum = useTranslations("enum");
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!enabled) {
    return <Alert tone="info">{t("storageDisabled")}</Alert>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
      >
        {t("upload")}
      </button>
    );
  }

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      toast.error(t("fileRequired"));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("fileTooLarge"));
      return;
    }

    setBusy(true);
    try {
      const urlForm = new FormData();
      urlForm.set("fileName", file.name);
      // Boş `type` olabiliyor (bazı tarayıcılar bilinmeyen uzantıda vermiyor);
      // sunucu beyaz listeye bakıp reddediyor, sessizce "octet-stream"
      // uydurmak reddi anlaşılmaz kılardı.
      urlForm.set("contentType", file.type);
      urlForm.set("sizeBytes", String(file.size));

      const signed = await requestUploadUrl({ status: "idle" }, urlForm);
      if (signed.status !== "ok" || !signed.data) {
        toast.error(signed.message || t("uploadFailed"));
        return;
      }

      const put = await fetch(signed.data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });
      if (!put.ok) {
        toast.error(t("uploadFailed"));
        return;
      }

      data.delete("file");
      data.set("key", signed.data.key);
      const created = await createDocument({ status: "idle" }, data);
      if (created.status !== "ok") {
        toast.error(created.message || t("uploadFailed"));
        return;
      }

      toast.success(created.message ?? t("uploaded"));
      form.reset();
      setOpen(false);
      // Liste sunucuda render ediliyor; `revalidatePath` yalnız önbelleği
      // düşürüyor, ekranın tazelenmesi için gezinme gerekiyor.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      <label className="sm:col-span-2 text-sm">
        <span className="mb-1 block font-medium text-fg">{t("file")}</span>
        <input type="file" name="file" required className="block w-full text-sm" />
        <span className="mt-1 block text-xs text-fg-subtle">{t("fileHint")}</span>
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-fg">{t("docTitle")}</span>
        <Input name="title" required maxLength={200} />
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-fg">{t("category")}</span>
        <Select name="category" defaultValue="other">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tEnum(`documentCategory.${c}`)}
            </option>
          ))}
        </Select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-fg">{t("visibility")}</span>
        {/* Varsayılan `managers`: yanlış seçilen görünürlük, kimlik
            fotokopisini sakine açmak demek. */}
        <Select name="visibility" defaultValue="managers">
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {tEnum(`documentVisibility.${v}`)}
            </option>
          ))}
        </Select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block font-medium text-fg">{t("expiresAt")}</span>
        <Input name="expiresAt" type="date" />
      </label>

      <label className="sm:col-span-2 text-sm">
        <span className="mb-1 block font-medium text-fg">{t("description")}</span>
        <Textarea name="description" rows={2} maxLength={2000} />
      </label>

      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? <Spinner label={t("uploading")} /> : null}
          {busy ? t("uploading") : t("upload")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-60"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
