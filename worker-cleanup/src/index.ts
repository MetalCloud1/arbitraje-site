export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
}

export default {
  // Worker minimo: no sirve trafico HTTP, solo responde al cron.
  async fetch() {
    return new Response('Este worker solo corre en un horario programado (cron).', { status: 200 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCleanup(env));
  },
};

async function runCleanup(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT id, cover_key FROM articles WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')"
  ).all<{ id: number; cover_key: string | null }>();

  const expired = results ?? [];
  if (expired.length === 0) {
    console.log('Limpieza programada: no hay articulos vencidos.');
    return;
  }

  await env.DB.prepare(
    "DELETE FROM articles WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')"
  ).run();

  for (const row of expired) {
    if (row.cover_key) {
      await env.IMAGES.delete(row.cover_key);
    }
  }

  console.log(`Limpieza programada: ${expired.length} articulo(s) eliminado(s).`);
}
