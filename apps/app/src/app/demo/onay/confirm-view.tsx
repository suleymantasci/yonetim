"use client";

import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, TimerOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Card, CardBody, cn } from "@yonetim/ui";

import Link from "@/components/link";

import { confirmDemo, demoStatus, type DemoViewState } from "../actions";

const POLL_MS = 2_000;
/** Hazırlanıyor ekranı en çok bu kadar yoklar; sonra worker'ın bakım turu `failed` yazar. */
const POLL_LIMIT = 150;

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get("t");
}

/**
 * Onay → kurulum → giriş bilgileri.
 *
 * Bağlantı ilk açılışta kurulumu başlatıyor; sonraki açılışlarda (yenileme,
 * ikinci sekme) aynı uç mevcut durumu döndürüyor, ikinci bir demo açılmıyor.
 */
export function ConfirmView() {
  const t = useTranslations("app.demoConfirm");
  const [view, setView] = useState<DemoViewState | null>(null);
  const [step, setStep] = useState(0);
  const token = useRef<string | null>(null);
  const polls = useRef(0);

  const start = useCallback(async () => {
    const value = readToken();
    token.current = value;
    if (!value) {
      setView({ kind: "error", code: "invalid" });
      return;
    }
    polls.current = 0;
    setView(null);
    setView(await confirmDemo(value));
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  // Hazırlanırken yokla; adım göstergesi ilerlesin.
  const provisioning = view?.kind === "status" && view.data.status === "provisioning";
  useEffect(() => {
    if (!provisioning || !token.current) return;
    const stepTimer = setInterval(() => setStep((s) => Math.min(s + 1, 3)), 1_400);
    const pollTimer = setInterval(async () => {
      polls.current += 1;
      if (polls.current > POLL_LIMIT || !token.current) return;
      const next = await demoStatus(token.current);
      if (next.kind === "error" || next.data.status !== "provisioning") setView(next);
    }, POLL_MS);
    return () => {
      clearInterval(stepTimer);
      clearInterval(pollTimer);
    };
  }, [provisioning]);

  if (!view) return <Preparing step={0} />;

  if (view.kind === "error") {
    const map = {
      invalid: { title: t("invalidTitle"), hint: t("invalidHint") },
      expired: { title: t("expiredTitle"), hint: t("expiredHint") },
      capacity: { title: t("capacityTitle"), hint: t("capacityHint") },
      generic: { title: t("failedTitle"), hint: t("failedHint") },
    } as const;
    const m = map[view.code];
    return (
      <Message icon={<AlertTriangle aria-hidden className="h-10 w-10 text-warning-fg" />} title={m.title} hint={m.hint}>
        {view.code === "generic" || view.code === "capacity" ? (
          <button type="button" onClick={() => void start()} className={primaryButton}>
            {t("retry")}
          </button>
        ) : (
          <Link href="/demo" className={primaryButton}>
            {t("newRequest")}
          </Link>
        )}
      </Message>
    );
  }

  const data = view.data;
  switch (data.status) {
    case "pending":
    case "provisioning":
      return <Preparing step={step} />;
    case "ready":
      return <Ready data={data} />;
    case "failed":
      return (
        <Message
          icon={<AlertTriangle aria-hidden className="h-10 w-10 text-warning-fg" />}
          title={t("failedTitle")}
          hint={data.error === "attempts_exhausted" ? t("exhausted") : t("failedHint")}
        >
          {data.error === "attempts_exhausted" ? (
            <Link href="/demo" className={primaryButton}>
              {t("newRequest")}
            </Link>
          ) : (
            <button type="button" onClick={() => void start()} className={primaryButton}>
              {t("retry")}
            </button>
          )}
        </Message>
      );
    case "purged":
    case "cancelled":
      return (
        <Message
          icon={<TimerOff aria-hidden className="h-10 w-10 text-fg-subtle" />}
          title={data.status === "purged" ? t("purgedTitle") : t("expiredTitle")}
          hint={data.status === "purged" ? t("purgedHint") : t("expiredHint")}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/kayit" className={primaryButton}>
              {t("signup")}
            </Link>
            <Link href="/demo" className={secondaryButton}>
              {t("newRequest")}
            </Link>
          </div>
        </Message>
      );
  }
}

const primaryButton =
  "inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-fg hover:bg-primary-hover";
const secondaryButton =
  "inline-flex h-11 items-center justify-center rounded-lg border border-border-strong px-5 text-sm font-semibold text-fg hover:bg-hover";

function Message({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody className="space-y-4 text-center">
        <div className="mx-auto w-fit">{icon}</div>
        <div>
          <h1 className="font-heading text-lg font-bold text-fg">{title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{hint}</p>
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

function Preparing({ step }: { step: number }) {
  const t = useTranslations("app.demoConfirm");
  const steps = ["sites", "people", "money", "modules"] as const;
  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="text-center" role="status" aria-live="polite">
          <Loader2 aria-hidden className="mx-auto h-10 w-10 animate-spin text-primary motion-reduce:animate-none" />
          <h1 className="mt-3 font-heading text-lg font-bold text-fg">{t("preparing")}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t("preparingHint")}</p>
        </div>
        <ol className="space-y-2">
          {steps.map((key, index) => {
            const done = index < step;
            const active = index === step;
            return (
              <li key={key} className={cn("flex items-center gap-2 text-sm", done ? "text-fg" : active ? "text-fg" : "text-fg-subtle")}>
                {done ? (
                  <Check aria-hidden className="h-4 w-4 text-success-fg" />
                ) : active ? (
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
                ) : (
                  <span aria-hidden className="h-4 w-4 rounded-full border border-border-strong" />
                )}
                {t(`steps.${key}`)}
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

function Ready({ data }: { data: Extract<DemoViewState, { kind: "status" }>["data"] }) {
  const t = useTranslations("app.demoConfirm");
  const expires = data.expiresAt
    ? new Intl.DateTimeFormat("tr-TR", {
        timeZone: "Europe/Istanbul",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(data.expiresAt))
    : "";
  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="text-center">
          <CheckCircle2 aria-hidden className="mx-auto h-10 w-10 text-success-fg" />
          <h1 className="mt-3 font-heading text-lg font-bold text-fg">{t("readyTitle")}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t("readyHint")}</p>
        </div>

        <dl className="space-y-3">
          <Credential label={t("loginEmail")} value={data.loginEmail ?? ""} />
          <Credential label={t("password")} value={data.password ?? ""} />
        </dl>

        {data.sites.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-fg-subtle">{t("sites")}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-fg">
              {data.sites.map((site) => (
                <li key={site}>{site}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {expires ? <p className="text-xs text-fg-subtle">{t("expires", { date: expires })}</p> : null}

        <a
          href={`/giris?e=${encodeURIComponent(data.loginEmail ?? "")}`}
          className={cn(primaryButton, "w-full")}
        >
          {t("goPanel")}
        </a>
      </CardBody>
    </Card>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  const t = useTranslations("app.demoConfirm");
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <dt className="text-xs font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface-sunken px-3 py-2 font-mono text-sm text-fg">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1_500);
            } catch {
              /* pano izni yoksa kullanıcı elle seçer */
            }
          }}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border-strong px-2 text-xs text-fg hover:bg-hover"
          aria-label={`${label}: ${copied ? t("copied") : t("copy")}`}
        >
          {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          {copied ? t("copied") : t("copy")}
        </button>
      </dd>
    </div>
  );
}
