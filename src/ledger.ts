import { Pool } from "pg";

export type SpendStatus = "reserved" | "confirmed" | "rejected" | "ambiguous";

export type SpendRow = {
  id: number;
  reportId: string;
  service: string;
  purpose: string;
  url: string;
  token: string;
  amountAtomic: bigint;
  txHash: string | null;
  status: SpendStatus;
  poll: string | null;
  createdAt: Date;
};

export type NewSpend = {
  reportId: string;
  service: string;
  purpose: string;
  url: string;
  token: string;
  amountAtomic: bigint;
};

export type Caps = {
  /** Most we may spend in one UTC day, in 6-decimal stablecoin atomic units. */
  dailyCapAtomic: bigint;
  /** Most we may spend on one report. */
  reportCapAtomic: bigint;
};

export class BudgetError extends Error {
  constructor(
    public readonly code: "per_call_cap" | "report_cap" | "daily_cap" | "unknown_asset" | "ledger_unavailable",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Every buy payment is written here BEFORE it is signed. A reservation counts toward
 * the budget forever, even if the payment turns out ambiguous, so the system fails closed.
 */
export interface Ledger {
  /** Atomically checks the daily and per-report caps and records the reservation. Throws BudgetError. */
  reserve(spend: NewSpend, caps: Caps, now?: Date): Promise<number>;
  settle(id: number, patch: { status: SpendStatus; txHash?: string; poll?: string }): Promise<void>;
  list(limit: number): Promise<SpendRow[]>;
  spentToday(now?: Date): Promise<bigint>;
}

export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function checkCaps(spend: NewSpend, spentToday: bigint, spentOnReport: bigint, caps: Caps) {
  if (spentToday + spend.amountAtomic > caps.dailyCapAtomic) {
    throw new BudgetError("daily_cap", "Daily spend cap reached. Refusing to pay.");
  }
  if (spentOnReport + spend.amountAtomic > caps.reportCapAtomic) {
    throw new BudgetError("report_cap", "Per-report spend cap reached. Refusing to pay.");
  }
}

/** In-memory ledger for tests and offline runs. Not durable. */
export class MemoryLedger implements Ledger {
  private rows: SpendRow[] = [];
  private nextId = 1;

  async reserve(spend: NewSpend, caps: Caps, now = new Date()): Promise<number> {
    const since = utcDayStart(now).getTime();
    const today = this.rows.filter((r) => r.createdAt.getTime() >= since);
    const sum = (rs: SpendRow[]) => rs.reduce((a, r) => a + r.amountAtomic, 0n);
    checkCaps(spend, sum(today), sum(today.filter((r) => r.reportId === spend.reportId)), caps);
    const row: SpendRow = { ...spend, id: this.nextId++, txHash: null, status: "reserved", poll: null, createdAt: now };
    this.rows.push(row);
    return row.id;
  }

  async settle(id: number, patch: { status: SpendStatus; txHash?: string; poll?: string }) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    row.status = patch.status;
    row.txHash = patch.txHash ?? row.txHash;
    row.poll = patch.poll ?? row.poll;
  }

  async list(limit: number) {
    return [...this.rows].reverse().slice(0, limit);
  }

  async spentToday(now = new Date()) {
    const since = utcDayStart(now).getTime();
    return this.rows.filter((r) => r.createdAt.getTime() >= since).reduce((a, r) => a + r.amountAtomic, 0n);
  }
}

/** Postgres ledger. Survives Render's ephemeral disk and spin-downs. */
export class PgLedger implements Ledger {
  constructor(private readonly pool: Pool) {}

  static async connect(databaseUrl: string): Promise<PgLedger> {
    const pool = new Pool({ connectionString: databaseUrl, max: 4, ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false } });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spend_ledger (
        id BIGSERIAL PRIMARY KEY,
        report_id TEXT NOT NULL,
        service TEXT NOT NULL,
        purpose TEXT NOT NULL,
        url TEXT NOT NULL,
        token TEXT NOT NULL,
        amount_atomic NUMERIC(40,0) NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL,
        poll TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS spend_ledger_tx_hash ON spend_ledger (tx_hash) WHERE tx_hash IS NOT NULL;
    `);
    return new PgLedger(pool);
  }

  async reserve(spend: NewSpend, caps: Caps, now = new Date()): Promise<number> {
    const client = await this.pool.connect().catch(() => {
      throw new BudgetError("ledger_unavailable", "Ledger database unavailable. Refusing to pay.");
    });
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(727001)");
      const since = utcDayStart(now);
      const day = await client.query(
        "SELECT COALESCE(SUM(amount_atomic),0)::text AS s FROM spend_ledger WHERE created_at >= $1",
        [since],
      );
      const rep = await client.query(
        "SELECT COALESCE(SUM(amount_atomic),0)::text AS s FROM spend_ledger WHERE created_at >= $1 AND report_id = $2",
        [since, spend.reportId],
      );
      checkCaps(spend, BigInt(day.rows[0].s), BigInt(rep.rows[0].s), caps);
      const ins = await client.query(
        `INSERT INTO spend_ledger (report_id, service, purpose, url, token, amount_atomic, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'reserved',$7) RETURNING id`,
        [spend.reportId, spend.service, spend.purpose, spend.url, spend.token, spend.amountAtomic.toString(), now],
      );
      await client.query("COMMIT");
      return Number(ins.rows[0].id);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      if (err instanceof BudgetError) throw err;
      throw new BudgetError("ledger_unavailable", "Ledger write failed. Refusing to pay.");
    } finally {
      client.release();
    }
  }

  async settle(id: number, patch: { status: SpendStatus; txHash?: string; poll?: string }) {
    await this.pool.query(
      "UPDATE spend_ledger SET status=$2, tx_hash=COALESCE($3,tx_hash), poll=COALESCE($4,poll) WHERE id=$1",
      [id, patch.status, patch.txHash ?? null, patch.poll ?? null],
    );
  }

  async list(limit: number) {
    const res = await this.pool.query("SELECT * FROM spend_ledger ORDER BY id DESC LIMIT $1", [limit]);
    return res.rows.map(
      (r): SpendRow => ({
        id: Number(r.id),
        reportId: r.report_id,
        service: r.service,
        purpose: r.purpose,
        url: r.url,
        token: r.token,
        amountAtomic: BigInt(r.amount_atomic),
        txHash: r.tx_hash,
        status: r.status,
        poll: r.poll,
        createdAt: new Date(r.created_at),
      }),
    );
  }

  async spentToday(now = new Date()) {
    const res = await this.pool.query("SELECT COALESCE(SUM(amount_atomic),0)::text AS s FROM spend_ledger WHERE created_at >= $1", [
      utcDayStart(now),
    ]);
    return BigInt(res.rows[0].s);
  }
}
