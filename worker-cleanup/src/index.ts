export interface Env {
  DB: D1Database;
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

// Ya NO borra nada. Los articulos cuya fecha programada (expires_at) ya paso se
// mandan a la papelera (deleted_at), igual que el boton "Enviar vencidos a la
// papelera" de la zona restringida (ver src/lib/papelera.ts). El borrado
// definitivo solo existe en esa zona y exige escribir ELIMINAR. Por eso este
// Worker tampoco recibe el binding de R2: no puede tocar las imagenes.
async function runCleanup(env: Env): Promise<void> {
  const res = await env.DB.prepare(
    `UPDATE articles SET deleted_at = datetime('now')
     WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?`
  )
    .bind(new Date().toISOString())
    .run();

  const n = res.meta.changes ?? 0;
  console.log(
    n === 0
      ? 'Limpieza programada: no hay articulos vencidos.'
      : `Limpieza programada: ${n} articulo(s) enviado(s) a la papelera.`
  );
}
