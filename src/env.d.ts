/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Bindings, variables y secretos del Worker (wrangler.jsonc + .dev.vars).
// Se leen con `import { env } from 'cloudflare:workers'`, que en Astro 6+
// reemplaza a `Astro.locals.runtime.env`. Tras cambiar wrangler.jsonc o
// .dev.vars puedes regenerar tipos con `npx wrangler types`, o mantener
// esta interfaz a mano (es lo que se hace aquí).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    R2_IMAGES: R2Bucket;
    RATE_LIMIT_KV: KVNamespace;
    ADMIN_USER: string;
    ADMIN_PASS_HASH: string;
    SESSION_SECRET: string;
    TURNSTILE_SECRET_KEY: string;
    PUBLIC_TURNSTILE_SITE_KEY: string;
    RESEND_API_KEY: string;
    RESEND_FROM_EMAIL: string;
    ARBITROS_NOTIFY_EMAIL: string;
    ENTRENADORES_NOTIFY_EMAIL?: string;
    CLUBES_NOTIFY_EMAIL?: string;
  }
}

// Tipo global `Env` (lo usan los helpers del adaptador y algunos módulos de src/lib).
interface Env extends Cloudflare.Env {}

// `Astro.locals.cfContext` (ExecutionContext) lo tipa el adaptador de Cloudflare;
// aquí solo se añade lo propio del proyecto.
declare namespace App {
  interface Locals {
    session?: { user: string } | null;
  }
}
