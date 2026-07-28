"use client";

import { Check, ChevronDown, Eye, EyeOff, Search, Upload, X } from "lucide-react";
import {
  useEffect, useId, useMemo, useRef, useState,
  type ChangeEvent, type ReactNode,
} from "react";

import { isValidIban, isValidTckn, normalizePhone } from "@yonetim/core";

import { cn } from "../cn";

/**
 * Alan bileşenleri — GAP 4.3.5 / 4.6.
 *
 * Tasarım kararı: **kontrollü maske + gizli ham değer**. Her özel alan
 * kullanıcıya biçimlenmiş metni gösterir, sunucuya `name` altında
 * normalize edilmiş ham değeri (kuruş / E.164 / boşluksuz IBAN) yollar.
 * Böylece Server Action tarafında ayrıca ayrıştırma yapmak gerekmez ve
 * JS kapalıyken de form gönderilebilir (progressive enhancement:
 * ham `<input>` görünür olur, maske devreye girmez).
 *
 * Doğrulama iki katmanlı: burada anlık (inline) ipucu, sunucuda Zod ile
 * bağlayıcı karar. İstemci doğrulaması asla tek savunma hattı değildir.
 */

const fieldBase =
  "w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-fg " +
  "placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-2 " +
  "focus:ring-ring/40 disabled:bg-surface-sunken disabled:text-fg-subtle";

const invalidRing = "border-danger focus:border-danger focus:ring-danger/30";

/* ------------------------------------------------------------------ *
 * Form iskeleti
 * ------------------------------------------------------------------ */

/** Form içi mantıksal grup — uzun formlarda tarama kolaylığı (GAP 4.3.2 hiyerarşi). */
export function FormSection({
  title,
  description,
  children,
  columns = 2,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  columns?: 1 | 2 | 3;
}) {
  return (
    <section className="border-b border-border py-5 first:pt-0 last:border-0">
      <h4 className="text-sm font-semibold text-fg">{title}</h4>
      {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
      <div
        className={cn(
          "mt-4 grid gap-4",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Uzun formlarda kaybolmayan kaydet çubuğu (GAP 4.3.1).
 *
 * NEGATİF KENAR BOŞLUĞU DÜZELTİLDİ: çubuk `sm:-mx-6` ile kapsayıcısından
 * taşıyordu ama tek kullanıcısı olan `CardBody` her ölçüde `p-4`. Sonuç, her
 * form sayfasının **altında sekiz piksellik yatay kaydırma çubuğu**ydu. Artık
 * inset tek değer (`-mx-4`) ve kapsayıcının dolgusuyla birebir aynı.
 *
 * `-mb-4` + `rounded-b-lg`: çubuk kartın alt kenarına oturur, arada bir şerit
 * boşluk kalmaz ve kartın yuvarlak köşesinden taşmaz.
 */
export function StickyFormBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-6 flex flex-wrap items-center justify-end gap-2 rounded-b-lg border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
      {children}
    </div>
  );
}

/**
 * Modal/çekmece içindeki eylem çubuğu.
 *
 * `StickyFormBar`'dan farkı **yapışkan olmaması**: modalda kaydırılan şey
 * gövde, panelin kendisi değil. Çubuk panelin alt kenarında duran gerçek bir
 * `footer` olduğu için `sticky`/negatif marj hilesine gerek yok — taşma da,
 * içerikle çakışma da imkânsız hâle geliyor.
 */
export function ModalFormBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-sunken px-5 py-3 sm:px-6">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Basit sarmalayıcılar
 * ------------------------------------------------------------------ */

/**
 * Aç/kapa anahtarı — UI Faz 2.5'te iki hata giderildi.
 *
 * 1. **`<label>` içine `<button>` yerleştirilmişti.** `button` etiketlenebilir
 *    bir öğedir: etikete yapılan tıklama düğmeye iletiliyor, düğmenin kendisine
 *    yapılan tıklama ise tarayıcıya göre bir kez daha iletilebiliyordu —
 *    anahtar açılıp anında kapanıyordu. Yerine **gerçek bir checkbox**
 *    (`role="switch"`, görsel olarak gizli) kondu: etiket ilişkisi, klavye
 *    (Space), ekran okuyucu duyurusu ve JS kapalıyken gönderim artık
 *    tarayıcıdan geliyor. Görsel durum `peer-checked` ile CSS'ten çiziliyor,
 *    yani React state'i ile DOM arasında ayrışma ihtimali de kalmadı.
 *
 *    Gizli `input[type=hidden]` kaldırıldı: işaretsiz checkbox hiç
 *    gönderilmez ve `checkboxField` (`value === "on"`) bunu zaten `false`
 *    olarak okur — davranış aynı, alan sayısı bir eksik.
 *
 * 2. **Kutu yoktu.** Anahtar formun içinde çerçevesiz duruyor, komşusu olan
 *    `FormField`'lar çerçeveli olduğu için hizasız görünüyordu. Artık
 *    `RadioGroup` seçenekleriyle aynı kutu dilinde ve açıkken kutunun kendisi
 *    de işaretleniyor: durum yalnız 22 pikselik topuzdan okunmuyor.
 */
export function Switch({
  label,
  description,
  name,
  defaultChecked,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  name?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onCheckedChange?: (next: boolean) => void;
  disabled?: boolean;
}) {
  const controlled = checked !== undefined;

  return (
    <label
      className={cn(
        "flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-3 transition-colors",
        "has-[:checked]:border-primary has-[:checked]:bg-primary-soft",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-border-strong",
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>
        ) : null}
      </span>

      <input
        type="checkbox"
        role="switch"
        name={name}
        className="peer sr-only"
        disabled={disabled}
        {...(controlled
          ? { checked, onChange: (event) => onCheckedChange?.(event.target.checked) }
          : {
              defaultChecked,
              onChange: (event) => onCheckedChange?.(event.target.checked),
            })}
      />
      <span
        aria-hidden
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-border-strong transition-colors",
          "peer-checked:bg-primary",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
          // Topuz rayın **çocuğu**; `peer-*` yalnız kardeşe uygulanır, bu yüzden
          // kaydırma kuralı ray üzerinden çocuğa iniyor.
          "peer-checked:[&>span]:translate-x-[21px]",
        )}
      >
        <span className="absolute top-0.5 h-5 w-5 translate-x-0.5 rounded-full bg-surface shadow-sm ring-1 ring-black/5 transition-transform" />
      </span>
    </label>
  );
}

export interface Option {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
}

export function RadioGroup({
  name,
  options,
  defaultValue,
  legend,
  columns = 1,
  onChange,
}: {
  name: string;
  options: Option[];
  defaultValue?: string;
  legend?: string;
  columns?: 1 | 2 | 3;
  onChange?: (value: string) => void;
}) {
  return (
    <fieldset>
      {legend ? (
        <legend className="mb-2 text-sm font-medium text-fg">{legend}</legend>
      ) : null}
      <div
        className={cn(
          "grid gap-2",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm",
              "hover:bg-hover has-[:checked]:border-primary has-[:checked]:bg-primary-soft",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
              disabled={option.disabled}
              onChange={() => onChange?.(option.value)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="block font-medium text-fg">{option.label}</span>
              {option.description ? (
                <span className="block text-xs text-fg-muted">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxGroup({
  name,
  options,
  defaultValues = [],
  legend,
  columns = 2,
}: {
  name: string;
  options: Option[];
  defaultValues?: string[];
  legend?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset>
      {legend ? <legend className="mb-2 text-sm font-medium text-fg">{legend}</legend> : null}
      <div
        className={cn(
          "grid gap-2",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm hover:bg-hover has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={defaultValues.includes(option.value)}
              disabled={option.disabled}
              className="mt-0.5 h-4 w-4 rounded accent-primary"
            />
            <span className="min-w-0">
              <span className="block font-medium text-fg">{option.label}</span>
              {option.description ? (
                <span className="block text-xs text-fg-muted">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ *
 * Para
 * ------------------------------------------------------------------ */

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "");
}

/** Kuruş → "1.234,56" (TR yazımı). */
export function kurusToDisplay(kurus: number): string {
  const sign = kurus < 0 ? "-" : "";
  const abs = Math.abs(kurus);
  const lira = Math.floor(abs / 100).toLocaleString("tr-TR");
  return `${sign}${lira},${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Para girişi. Kullanıcı yalnızca rakam yazar; alan sağdan sola kuruş
 * doldurur (POS mantığı) — nokta/virgül karışıklığı imkânsız hale gelir.
 * Sunucuya gönderilen değer **kuruş cinsinden tam sayı**dır.
 */
export function MoneyInput({
  name,
  defaultKurus = 0,
  id,
  required,
  disabled,
  invalid,
  onKurusChange,
  currencySuffix = "₺",
}: {
  name: string;
  defaultKurus?: number;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onKurusChange?: (kurus: number) => void;
  currencySuffix?: string;
}) {
  const [kurus, setKurus] = useState(defaultKurus);

  function handle(event: ChangeEvent<HTMLInputElement>) {
    const raw = digitsOnly(event.target.value).slice(0, 13);
    const next = raw === "" ? 0 : Number(raw);
    setKurus(next);
    onKurusChange?.(next);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={kurus === 0 ? "" : kurusToDisplay(kurus)}
        onChange={handle}
        placeholder="0,00"
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, "pr-9 text-right tabular-nums", invalid && invalidRing)}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-fg-subtle"
      >
        {currencySuffix}
      </span>
      <input type="hidden" name={name} value={kurus} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Telefon (uluslararası)
 * ------------------------------------------------------------------ */

/**
 * Yaygın ülke kodları. Yonetimcell'in "yurt dışı numarası girilemiyor"
 * şikâyetini (GAP 3.1) kapatmak için ülke seçimi zorunlu tutulmadı:
 * kullanıcı `+` ile başlayan tam numarayı da yazabilir.
 */
export const PHONE_COUNTRIES = [
  { code: "TR", dial: "90", label: "Türkiye" },
  { code: "DE", dial: "49", label: "Almanya" },
  { code: "NL", dial: "31", label: "Hollanda" },
  { code: "GB", dial: "44", label: "Birleşik Krallık" },
  { code: "US", dial: "1", label: "ABD" },
  { code: "AZ", dial: "994", label: "Azerbaycan" },
  { code: "RU", dial: "7", label: "Rusya" },
  { code: "SA", dial: "966", label: "S. Arabistan" },
  { code: "AE", dial: "971", label: "BAE" },
  { code: "IR", dial: "98", label: "İran" },
] as const;

/** E.164'e çevirir; TR için @yonetim/core doğrulamasını kullanır. */
export function composeE164(dial: string, local: string): string | null {
  const localDigits = digitsOnly(local);
  if (localDigits === "") return null;
  if (dial === "90") return normalizePhone(localDigits);
  const composed = `+${dial}${localDigits.replace(/^0+/, "")}`;
  return composed.length >= 8 && composed.length <= 16 ? composed : null;
}

export function PhoneInput({
  name,
  defaultValue = "",
  id,
  required,
  disabled,
  invalid,
  invalidHint,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  invalidHint?: string;
}) {
  const initial = useMemo(() => {
    const match = PHONE_COUNTRIES.find((c) => defaultValue.startsWith(`+${c.dial}`));
    if (!match) return { dial: "90", local: digitsOnly(defaultValue) };
    return { dial: match.dial, local: defaultValue.slice(match.dial.length + 1) };
  }, [defaultValue]);

  const [dial, setDial] = useState(initial.dial);
  const [local, setLocal] = useState(initial.local);

  const e164 = composeE164(dial, local);
  const showError = (invalid || (local.length > 0 && e164 === null)) ?? false;

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={dial}
          onChange={(event) => setDial(event.target.value)}
          disabled={disabled}
          aria-label="Ülke kodu"
          className={cn(fieldBase, "w-32 shrink-0")}
        >
          {PHONE_COUNTRIES.map((country) => (
            <option key={country.code} value={country.dial}>
              +{country.dial} {country.code}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={local}
          onChange={(event) => setLocal(event.target.value.replace(/[^\d\s]/g, "").slice(0, 15))}
          placeholder={dial === "90" ? "5xx xxx xx xx" : "numara"}
          required={required}
          disabled={disabled}
          aria-invalid={showError || undefined}
          className={cn(fieldBase, "tabular-nums", showError && invalidRing)}
        />
      </div>
      {showError && invalidHint ? (
        <p className="mt-1 text-xs text-danger-fg">{invalidHint}</p>
      ) : null}
      <input type="hidden" name={name} value={e164 ?? ""} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * TCKN / IBAN
 * ------------------------------------------------------------------ */

/** TCKN girişi — 11 hane + matematiksel doğrulama, istemci tarafı anlık ipucu. */
export function TcknInput({
  name,
  defaultValue = "",
  id,
  required,
  disabled,
  invalidHint,
  masked,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  invalidHint?: string;
  /** Kayıtlı değer maskeli geldiyse (KVKK) açığa çıkarma butonu gösterir. */
  masked?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [revealed, setRevealed] = useState(!masked);
  const bad = value.length === 11 && !isValidTckn(value);

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(digitsOnly(event.target.value).slice(0, 11))}
          placeholder="11 haneli"
          required={required}
          disabled={disabled}
          aria-invalid={bad || undefined}
          className={cn(fieldBase, "pr-10 tabular-nums", bad && invalidRing)}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? "Gizle" : "Göster"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-subtle hover:text-fg"
        >
          {revealed ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
        </button>
      </div>
      {bad && invalidHint ? <p className="mt-1 text-xs text-danger-fg">{invalidHint}</p> : null}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/** IBAN girişi — 4'erli gruplama, mod-97 doğrulaması. */
export function IbanInput({
  name,
  defaultValue = "",
  id,
  required,
  disabled,
  invalidHint,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  invalidHint?: string;
}) {
  const [value, setValue] = useState(defaultValue.replace(/\s+/g, "").toUpperCase());
  const grouped = value.replace(/(.{4})/g, "$1 ").trim();
  const bad = value.length >= 15 && !isValidIban(value);

  return (
    <div>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={grouped}
        onChange={(event) =>
          setValue(event.target.value.replace(/\s+/g, "").toUpperCase().slice(0, 34))
        }
        placeholder="TR00 0000 0000 0000 0000 0000 00"
        required={required}
        disabled={disabled}
        aria-invalid={bad || undefined}
        className={cn(fieldBase, "font-mono tracking-wide", bad && invalidRing)}
      />
      {bad && invalidHint ? <p className="mt-1 text-xs text-danger-fg">{invalidHint}</p> : null}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tarih
 * ------------------------------------------------------------------ */

/**
 * Tarih seçici. Native `<input type="date">` kullanılır: takvim çizmek
 * yerine platformun (ve ekran okuyucunun) kendi bileşenini vermek hem daha
 * erişilebilir hem sıfır bundle. Görüntülenen biçim işletim sistemi
 * yereline uyar; gönderilen değer her zaman ISO (yyyy-mm-dd).
 */
export function DateInput({
  name,
  defaultValue,
  id,
  required,
  disabled,
  min,
  max,
  invalid,
  onValueChange,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  invalid?: boolean;
  /**
   * Değer değiştiğinde haber verir — alan **kontrolsüz kalır**.
   *
   * `value` prop'u bilinçli olarak eklenmedi: `type="date"` girdisinde
   * kontrollü mod, kullanıcı gün/ay/yıl kutuları arasında yazarken her ara
   * durumu React'e sokar ve tarayıcının kısmi girdisi ("2026-__-__") her
   * tuşta geçersiz sayılıp sıfırlanır. Çağıran değeri duymak istiyorsa
   * dinlemesi yeterli; alanı yönetmesi gerekmiyor.
   */
  onValueChange?: (value: string) => void;
}) {
  return (
    <input
      id={id}
      name={name}
      type="date"
      defaultValue={defaultValue}
      required={required}
      disabled={disabled}
      min={min}
      max={max}
      onChange={
        onValueChange ? (event) => onValueChange(event.target.value) : undefined
      }
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, invalid && invalidRing)}
    />
  );
}

/** Dönem seçici (yyyy-MM) — borçlandırma dönemleri için. */
export function PeriodInput({
  name,
  defaultValue,
  id,
  required,
  disabled,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      name={name}
      type="month"
      defaultValue={defaultValue}
      required={required}
      disabled={disabled}
      className={cn(fieldBase)}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Combobox (tek / çok seçim)
 * ------------------------------------------------------------------ */

/**
 * Aranabilir seçim. 200+ birim/sakin listesinde `<select>` kullanılamaz;
 * bu bileşen listbox desenini uygular (aria-activedescendant + ok tuşları).
 * Seçilen değerler gizli input'lar olarak yazılır → Server Action
 * `formData.getAll(name)` ile okur.
 */
export function Combobox({
  name,
  options,
  defaultValues = [],
  multiple = false,
  placeholder = "Seçiniz",
  searchPlaceholder = "Ara…",
  emptyText = "Sonuç yok",
  disabled,
  invalid,
  id,
}: {
  name: string;
  options: Option[];
  defaultValues?: string[];
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(defaultValues);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr");
    if (!needle) return options;
    return options.filter((option) => option.label.toLocaleLowerCase("tr").includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function toggle(value: string) {
    setSelected((current) => {
      if (!multiple) {
        setOpen(false);
        return [value];
      }
      return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    });
  }

  const labelFor = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  const summary =
    selected.length === 0
      ? placeholder
      : multiple && selected.length > 1
        ? `${labelFor(selected[0]!)} +${selected.length - 1}`
        : labelFor(selected[0]!);

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        // ARIA 1.2 combobox deseni: `aria-invalid` implicit `button` rolünde
        // desteklenmiyor, `combobox` rolünde destekleniyor. Rol açıkça
        // verilince hem doğrulama durumu okunuyor hem açılır ilişkisi doğru.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldBase,
          "flex items-center justify-between gap-2 text-left",
          selected.length === 0 && "text-fg-subtle",
          invalid && invalidRing,
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-fg-subtle" />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search aria-hidden className="h-4 w-4 text-fg-subtle" />
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- listbox açılışında arama beklenen davranış */}
            <input autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCursor(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCursor((c) => Math.min(c + 1, filtered.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const option = filtered[cursor];
                  if (option && !option.disabled) toggle(option.value);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
          </div>
          <ul id={listId} role="listbox" aria-multiselectable={multiple} className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-sm text-fg-subtle">{emptyText}</li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = selected.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => toggle(option.value)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg",
                        index === cursor && "bg-hover",
                        option.disabled && "opacity-50",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isSelected ? "border-primary bg-primary text-primary-fg" : "border-border-strong",
                        )}
                      >
                        {isSelected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.description ? (
                        <span className="shrink-0 text-xs text-fg-subtle">{option.description}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}

      {selected.length === 0 ? <input type="hidden" name={name} value="" /> : null}
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dosya
 * ------------------------------------------------------------------ */

export function FileInput({
  name,
  accept,
  multiple,
  maxSizeMb = 10,
  id,
  disabled,
  labels,
}: {
  name: string;
  accept?: string;
  multiple?: boolean;
  maxSizeMb?: number;
  id?: string;
  disabled?: boolean;
  labels: { prompt: string; hint: string; tooLarge: string; remove: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function accepted(list: FileList | null): File[] {
    const next = Array.from(list ?? []);
    const tooBig = next.find((file) => file.size > maxSizeMb * 1024 * 1024);
    setError(tooBig ? labels.tooLarge : null);
    return next.filter((file) => file.size <= maxSizeMb * 1024 * 1024);
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (disabled) return;
          const ok = accepted(event.dataTransfer.files);
          setFiles(ok);
          if (inputRef.current) inputRef.current.files = event.dataTransfer.files;
        }}
        className={cn(
          "rounded-lg border-2 border-dashed p-4 text-center transition-colors",
          dragging ? "border-primary bg-primary-soft" : "border-border-strong",
          disabled && "opacity-50",
        )}
      >
        <Upload aria-hidden className="mx-auto h-5 w-5 text-fg-subtle" />
        <label
          htmlFor={id ?? name}
          className="mt-2 block cursor-pointer text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {labels.prompt}
        </label>
        <p className="mt-0.5 text-xs text-fg-subtle">{labels.hint}</p>
        <input
          ref={inputRef}
          id={id ?? name}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => setFiles(accepted(event.target.files))}
          className="sr-only"
        />
      </div>

      {error ? <p className="mt-1 text-xs text-danger-fg">{error}</p> : null}

      {files.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {files.map((file) => (
            <li
              key={file.name}
              className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-xs text-fg-muted"
            >
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 tabular-nums">{(file.size / 1024).toFixed(0)} KB</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Yardımcılar
 * ------------------------------------------------------------------ */

/** Sayısal aralık seçici — simülatör/fiyat hesaplayıcı girdileri. */
export function RangeInput({
  name,
  min,
  max,
  step = 1,
  defaultValue,
  id,
  suffix,
  onValueChange,
}: {
  name: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  id?: string;
  suffix?: string;
  onValueChange?: (value: number) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        name={name}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          setValue(next);
          onValueChange?.(next);
        }}
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-surface-sunken accent-primary"
      />
      <output className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-fg">
        {value.toLocaleString("tr-TR")}
        {suffix ? <span className="ml-0.5 text-xs font-normal text-fg-subtle">{suffix}</span> : null}
      </output>
    </div>
  );
}

/** Kaldırılabilir filtre çipi (liste araç çubuklarında). */
export function Chip({
  label,
  onRemove,
  removeLabel = "Kaldır",
}: {
  label: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-xs text-fg-muted">
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="-mr-1 rounded-full p-0.5 hover:bg-hover hover:text-fg"
        >
          <X aria-hidden className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
