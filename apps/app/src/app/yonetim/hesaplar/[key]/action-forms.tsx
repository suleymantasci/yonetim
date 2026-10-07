"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Field, Input, Select, Textarea } from "@yonetim/ui";

// Yalnız **tip** alınıyor: `@/lib/form` çalışma zamanında `@/lib/context`
// üzerinden `next/headers`'a bağlanıyor ve o yalnız sunucuda çalışır.
// `idleState()` değerini çağırmak bu istemci bileşenini derlenemez yapardı.
import type { ActionState } from "@/lib/form";
import {
  extendSubscription,
  grantAddon,
  runAccountAction,
  runTenantAction,
  startImpersonation,
} from "../actions";

/** Modül seviyesinde sabit: her render'da yeni nesne, gereksiz yeniden render. */
const IDLE: ActionState = { status: "idle" };

/**
 * Süper-admin aksiyon formları.
 *
 * HEPSİNDE GEREKÇE ALANI VE HEPSİ AYNI DESENDE: her form `useActionState` ile
 * sunucu aksiyonuna bağlı, doğrulama sunucuda, hata alan bazında dönüyor.
 * Ekranın tamamı `<form>` — JS kapalıyken de çalışıyor.
 *
 * NEDEN AYRI AYRI FORMLAR, TEK "AKSİYON SEÇ" FORMU DEĞİL: her aksiyonun farklı
 * alanları var (uzatmada gün, ek pakette adet ve fiyat, geçişte kullanıcı) ve
 * tek forma sıkıştırılsaydı kullanıcı hangi alanın hangi aksiyona ait olduğunu
 * ekrandan okuyamazdı. Daha kötüsü, "kapat" ile "süre uzat" aynı gönder
 * düğmesini paylaşırdı.
 */

/** Ortak gerekçe alanı — eşik sözleşmedeki `changeReason` ile aynı (10 karakter). */
function ReasonField({ error }: { error?: string }) {
  const t = useTranslations("app.platformAccounts");
  return (
    <Field label={t("field.reason")} error={error} required hint={t("field.reasonHint")}>
      <Textarea name="reason" required minLength={10} maxLength={500} rows={2} />
    </Field>
  );
}

function SubmitButton({ label, tone }: { label: string; tone?: "danger" }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={
        tone === "danger"
          ? "rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-danger-fg disabled:opacity-60"
          : "rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg hover:bg-hover disabled:opacity-60"
      }
    >
      {label}
    </button>
  );
}

function StateAlert({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <Alert tone={state.status === "ok" ? "success" : "danger"}>{state.message}</Alert>
  );
}

/* ------------------------------------------------------ süre uzatma */

export function ExtendForm({
  sites,
}: {
  sites: { id: string; name: string; status: string }[];
}) {
  const t = useTranslations("app.platformAccounts");
  const [state, action] = useActionState<ActionState, FormData>(
    extendSubscription,
    IDLE,
  );

  return (
    <form action={action} className="space-y-3">
      <StateAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("field.site")} error={state.fieldErrors?.tenantId?.[0]} required>
          <Select name="tenantId" required>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("field.days")} error={state.fieldErrors?.days?.[0]} required>
          <Input name="days" type="number" min={1} max={730} defaultValue={30} required />
        </Field>
      </div>
      <ReasonField error={state.fieldErrors?.reason?.[0]} />
      <SubmitButton label={t("action.extend")} />
    </form>
  );
}

/* ------------------------------------------- hesap dondur/aç/kapat */

export function AccountActionForm({ accountKey }: { accountKey: string }) {
  const t = useTranslations("app.platformAccounts");
  const [state, action] = useActionState<ActionState, FormData>(
    runAccountAction,
    IDLE,
  );

  return (
    <form action={action} className="space-y-3">
      <StateAlert state={state} />
      <input type="hidden" name="accountKey" value={accountKey} />
      <Field label={t("field.accountAction")} error={state.fieldErrors?.action?.[0]} required>
        <Select name="action" required defaultValue="freeze">
          <option value="freeze">{t("action.freeze")}</option>
          <option value="activate">{t("action.activate")}</option>
          <option value="close">{t("action.close")}</option>
        </Select>
      </Field>
      <ReasonField error={state.fieldErrors?.reason?.[0]} />
      <p className="text-xs text-fg-subtle">{t("accountActionScopeWarning")}</p>
      <SubmitButton label={t("action.applyAccountAction")} tone="danger" />
    </form>
  );
}

/* ------------------------------------------- site arşiv/geri aç/sil */

export function TenantActionForm({
  sites,
  canPurge,
}: {
  sites: { id: string; name: string; status: string }[];
  canPurge: boolean;
}) {
  const t = useTranslations("app.platformAccounts");
  const [state, action] = useActionState<ActionState, FormData>(
    runTenantAction,
    IDLE,
  );

  return (
    <form action={action} className="space-y-3">
      <StateAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("field.site")} error={state.fieldErrors?.tenantId?.[0]} required>
          <Select name="tenantId" required>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("field.tenantAction")} error={state.fieldErrors?.action?.[0]} required>
          <Select name="action" required defaultValue="archive">
            <option value="archive">{t("action.archive")}</option>
            <option value="restore">{t("action.restore")}</option>
            {/*
              Kalıcı silme seçeneği yetki yoksa hiç render edilmiyor. Uçta
              zaten `tenant:delete` isteniyor ve reddediyor; seçeneği gizlemek
              ek bir güvenlik katmanı değil, destek personeline basacağı anda
              hata alacağı bir düğme göstermemek.
            */}
            {canPurge ? <option value="purge">{t("action.purge")}</option> : null}
          </Select>
        </Field>
      </div>
      <ReasonField error={state.fieldErrors?.reason?.[0]} />
      <p className="text-xs text-fg-subtle">{t("purgeWarning")}</p>
      <SubmitButton label={t("action.applyTenantAction")} tone="danger" />
    </form>
  );
}

/* ------------------------------------------------------- ek paket */

export function AddonForm({
  sites,
}: {
  sites: { id: string; name: string; status: string }[];
}) {
  const t = useTranslations("app.platformAccounts");
  const [state, action] = useActionState<ActionState, FormData>(grantAddon, IDLE);

  return (
    <form action={action} className="space-y-3">
      <StateAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("field.site")} error={state.fieldErrors?.tenantId?.[0]} required>
          <Select name="tenantId" required>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("field.addonKind")} required>
          <Select name="kind" required defaultValue="sms">
            <option value="sms">{t("addonKind.sms")}</option>
            <option value="whatsapp">{t("addonKind.whatsapp")}</option>
          </Select>
        </Field>
        <Field label={t("field.quantity")} error={state.fieldErrors?.quantity?.[0]} required>
          <Input name="quantity" type="number" min={1} max={1000000} defaultValue={500} required />
        </Field>
        {/*
          Fiyat kuruş cinsinden gizli bir alan değil, açık bir sayı alanı:
          bu ekranı kullanan kişi platform ekibi ve tutarı bilerek giriyor.
          0 bırakmak bedelsiz tanımlama demek ve kayıt `manual_grant` olarak
          işaretleniyor — hediye krediler gelir raporunda satış gibi
          görünmesin.
        */}
        <Field label={t("field.addonPrice")} hint={t("field.addonPriceHint")}>
          <Input name="totalPriceMinor" type="number" min={0} step={1} defaultValue={0} />
        </Field>
        <Field label={t("field.validUntil")} hint={t("field.validUntilHint")}>
          <Input name="validUntil" type="date" />
        </Field>
      </div>
      <ReasonField error={state.fieldErrors?.reason?.[0]} />
      <SubmitButton label={t("action.grantAddon")} />
    </form>
  );
}

/* ------------------------------------------------------ hesaba geçiş */

export function ImpersonateForm({
  users,
  sites,
}: {
  users: { id: string; name: string; roles: string[] }[];
  sites: { id: string; name: string; status: string }[];
}) {
  const t = useTranslations("app.platformAccounts");
  const [state, action] = useActionState<ActionState, FormData>(
    startImpersonation,
    IDLE,
  );

  if (users.length === 0) {
    return <p className="text-sm text-fg-subtle">{t("noImpersonationTarget")}</p>;
  }

  return (
    <form action={action} className="space-y-3">
      <StateAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("field.targetUser")} error={state.fieldErrors?.userId?.[0]} required>
          <Select name="userId" required>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("field.site")} error={state.fieldErrors?.tenantId?.[0]} required>
          <Select name="tenantId" required>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ReasonField error={state.fieldErrors?.reason?.[0]} />
      <p className="text-xs text-fg-subtle">{t("impersonateWarning")}</p>
      <SubmitButton label={t("action.impersonate")} />
    </form>
  );
}
