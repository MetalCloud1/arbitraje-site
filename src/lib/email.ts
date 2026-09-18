// Envío de correos vía Resend, con un corte propio ANTES de llegar al
// límite del plan (3000/mes) -- ver conversación de diseño. El corte
// es preventivo (2950, no 3000) para dejar margen a cualquier otro
// correo que salga de la misma cuenta de Resend por fuera de esta app.

const QUOTA_LIMIT = 2950;

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

/**
 * Reserva un envío del cupo mensual de forma atómica: el chequeo y el
 * incremento son la MISMA operación SQL, así que no hay ventana entre
 * "leer el contador" y "sumarle uno" donde dos requests concurrentes
 * puedan pasarse del límite juntas.
 *
 * Devuelve true si había cupo (y ya quedó reservado). Devuelve false
 * si el mes ya llegó al límite -- en ese caso NO se reservó nada y no
 * hay que llamar a Resend.
 */
export async function reserveEmailQuota(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO email_quota (month_key, count) VALUES (?1, 1)
       ON CONFLICT(month_key) DO UPDATE SET count = count + 1
       WHERE email_quota.count < ?2
       RETURNING count`
    )
    .bind(currentMonthKey(), QUOTA_LIMIT)
    .first<{ count: number }>();
  return row !== null;
}

export async function getEmailQuotaUsage(db: D1Database): Promise<{ used: number; limit: number; monthKey: string }> {
  const monthKey = currentMonthKey();
  const row = await db.prepare('SELECT count FROM email_quota WHERE month_key = ?').bind(monthKey).first<{ count: number }>();
  return { used: row?.count ?? 0, limit: QUOTA_LIMIT, monthKey };
}

export interface SendEmailInput {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
}

export async function sendEmail(apiKey: string, input: SendEmailInput): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        reply_to: input.replyTo,
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!res.ok) {
      console.error('Resend respondió con error:', res.status, await res.text());
    }
    return res.ok;
  } catch (err) {
    console.error('Error de red enviando email vía Resend:', err);
    return false;
  }
}
