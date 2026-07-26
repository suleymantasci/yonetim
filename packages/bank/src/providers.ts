import { serverEnv } from "@yonetim/config";
import {
  CircuitBreaker, Err, Ok, errors, failover, roundHalfUp, withRetry, type Kurus, type Result,
} from "@yonetim/core";

/**
 * Open Banking aggregator katmanı — SPEC Bölüm 7.2 + 3.10.
 * Apsiyon'un Şekerbank arızası (1 ay tahsilat yansımaması) tekrarlanmasın diye
 * çoklu sağlayıcı + devre kesici + polling fallback.
 */

export type BankProviderName = "param" | "bkm" | "manual_csv";

export interface BankTransactionDto {
  externalId: string;
  direction: "in" | "out";
  amountKurus: Kurus;
  balanceAfterKurus?: Kurus;
  counterparty?: string;
  counterpartyIban?: string;
  description?: string;
  transactionAt: Date;
  provider: BankProviderName;
  raw: Record<string, unknown>;
}

export interface BankProvider {
  name: BankProviderName;
  isConfigured(): boolean;
  fetchTransactions(params: {
    iban: string;
    since: Date;
    until?: Date;
  }): Promise<Result<BankTransactionDto[]>>;
  fetchBalance(iban: string): Promise<Result<Kurus>>;
}

class ParamProvider implements BankProvider {
  readonly name = "param" as const;

  isConfigured(): boolean {
    const c = serverEnv.paramBanking();
    return !!(c.clientId && c.clientSecret && c.baseUrl);
  }

  private async token(): Promise<string> {
    const c = serverEnv.paramBanking();
    const r = await fetch(`${c.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: c.clientId,
        client_secret: c.clientSecret,
      }),
    });
    if (!r.ok) throw new Error(`Param token HTTP ${r.status}`);
    const json = (await r.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("Param token alınamadı");
    return json.access_token;
  }

  async fetchTransactions(params: {
    iban: string;
    since: Date;
    until?: Date;
  }): Promise<Result<BankTransactionDto[]>> {
    const c = serverEnv.paramBanking();
    if (!this.isConfigured()) return Err(errors.integrationUnavailable("Param Open Banking"));
    try {
      const items = await withRetry(async () => {
        const token = await this.token();
        const url = new URL(`${c.baseUrl}/accounts/${encodeURIComponent(params.iban)}/transactions`);
        url.searchParams.set("from", params.since.toISOString());
        if (params.until) url.searchParams.set("to", params.until.toISOString());
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`Param HTTP ${r.status}`);
        const json = (await r.json()) as { transactions?: Record<string, unknown>[] };
        return json.transactions ?? [];
      });

      return Ok(
        items.map((t) => ({
          externalId: String(t.id ?? t.transactionId ?? ""),
          direction: Number(t.amount ?? 0) >= 0 ? "in" : "out",
          amountKurus: Math.abs(roundHalfUp(Number(t.amount ?? 0) * 100)),
          balanceAfterKurus:
            t.balance !== undefined ? roundHalfUp(Number(t.balance) * 100) : undefined,
          counterparty: t.counterpartyName ? String(t.counterpartyName) : undefined,
          counterpartyIban: t.counterpartyIban ? String(t.counterpartyIban) : undefined,
          description: t.description ? String(t.description) : undefined,
          transactionAt: new Date(String(t.date ?? t.transactionDate ?? Date.now())),
          provider: this.name,
          raw: t,
        })),
      );
    } catch (error) {
      return Err(errors.integrationUnavailable(`Param (${(error as Error).message})`));
    }
  }

  async fetchBalance(iban: string): Promise<Result<Kurus>> {
    const c = serverEnv.paramBanking();
    if (!this.isConfigured()) return Err(errors.integrationUnavailable("Param Open Banking"));
    try {
      const token = await this.token();
      const r = await fetch(`${c.baseUrl}/accounts/${encodeURIComponent(iban)}/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Param HTTP ${r.status}`);
      const json = (await r.json()) as { balance?: number };
      return Ok(roundHalfUp(Number(json.balance ?? 0) * 100));
    } catch (error) {
      return Err(errors.integrationUnavailable(`Param (${(error as Error).message})`));
    }
  }
}

/**
 * Manuel CSV/MT940 içe aktarma — hiçbir aggregator bağlı değilse
 * yönetici banka ekstresini yükleyerek mutabakat yapabilir (fail-safe).
 */
class ManualCsvProvider implements BankProvider {
  readonly name = "manual_csv" as const;
  isConfigured(): boolean {
    return true;
  }
  async fetchTransactions(): Promise<Result<BankTransactionDto[]>> {
    return Ok([]);
  }
  async fetchBalance(): Promise<Result<Kurus>> {
    return Ok(0);
  }
}

export const paramProvider = new ParamProvider();
export const manualCsvProvider = new ManualCsvProvider();

const breakers = new Map<BankProvider, CircuitBreaker>([
  [paramProvider, new CircuitBreaker("param", 3, 300_000)],
]);

export function activeBankProviders(): BankProvider[] {
  const list: BankProvider[] = [paramProvider].filter((p) => p.isConfigured());
  return list.length > 0 ? list : [manualCsvProvider];
}

/** Failover ile hareketleri çeker; hangi sağlayıcının yanıt verdiğini de döner. */
export async function fetchTransactionsWithFailover(params: {
  iban: string;
  since: Date;
  until?: Date;
}): Promise<Result<{ transactions: BankTransactionDto[]; provider: BankProviderName }>> {
  try {
    const { result, provider } = await failover(
      activeBankProviders(),
      async (p) => {
        const res = await p.fetchTransactions(params);
        if (!res.ok) throw res.error;
        return res.value;
      },
      { breakers },
    );
    return Ok({ transactions: result, provider: provider.name });
  } catch {
    return Err(errors.integrationUnavailable("Banka entegrasyonu"));
  }
}

/**
 * Banka ekstresi CSV ayrıştırıcı (Türk bankalarının yaygın export formatı).
 * Sütunlar: Tarih;Açıklama;Tutar;Bakiye — ayraç ve ondalık ayırıcı otomatik algılanır.
 */
export function parseBankCsv(csv: string): BankTransactionDto[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  const delimiter = (lines[0]!.match(/;/g)?.length ?? 0) >= (lines[0]!.match(/,/g)?.length ?? 0) ? ";" : ",";

  const out: BankTransactionDto[] = [];
  for (const [i, line] of lines.slice(1).entries()) {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;
    const [dateStr, description, amountStr, balanceStr] = cols;
    const amount = parseTrNumber(amountStr ?? "0");
    if (Number.isNaN(amount)) continue;
    out.push({
      externalId: `csv-${i}-${dateStr}-${amountStr}`,
      direction: amount >= 0 ? "in" : "out",
      amountKurus: Math.abs(roundHalfUp(amount * 100)),
      balanceAfterKurus: balanceStr ? roundHalfUp(parseTrNumber(balanceStr) * 100) : undefined,
      description,
      counterparty: extractCounterparty(description ?? ""),
      transactionAt: parseTrDate(dateStr ?? ""),
      provider: "manual_csv",
      raw: { line },
    });
  }
  return out;
}

function parseTrNumber(value: string): number {
  return Number(value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
}

function parseTrDate(value: string): Date {
  const m = /(\d{2})[./](\d{2})[./](\d{4})/.exec(value);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function extractCounterparty(description: string): string | undefined {
  const m = /(?:GONDEREN|GÖNDEREN|ALICI|HAVALE|EFT|FAST)[: ]+([A-ZÇĞİÖŞÜ\s]{4,40})/i.exec(description);
  return m?.[1]?.trim();
}
