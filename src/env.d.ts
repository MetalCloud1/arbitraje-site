/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type ENV = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ADMIN_USER: string;
  ADMIN_PASS_HASH: string;
  SESSION_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  PUBLIC_TURNSTILE_SITE_KEY: string;
  RATE_LIMIT_KV: KVNamespace;
};

type Runtime = import('@astrojs/cloudflare').Runtime<ENV>;

declare namespace App {
  interface Locals extends Runtime {
    session?: { user: string } | null;
  }
}
