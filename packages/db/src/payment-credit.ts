import { sql, type SQL } from "drizzle-orm";

/** Remaining real payments are account credit; allocation is not new income. */
export function paymentCreditAmount(scope: {
  unit?: SQL;
  user?: SQL;
}): SQL<number> {
  return sql<number>`COALESCE((
    SELECT SUM(GREATEST(0, p.amount_kurus - p.refunded_kurus -
      COALESCE((SELECT SUM(a.amount_kurus) FROM payment_allocations a WHERE a.payment_id = p.id), 0)))
    FROM payments p
    WHERE p.status = 'completed' AND p.method NOT IN ('offset', 'credit_balance')
      ${scope.unit ? sql`AND p.unit_id = ${scope.unit}` : sql``}
      ${scope.user ? sql`AND COALESCE(p.debtor_user_id, p.payer_user_id) = ${scope.user}` : sql``}
  ), 0)`;
}
