# La Hora del Arbitraje — sitio + panel de administración

Sitio en Astro (SSR) desplegado en Cloudflare Workers, con artículos guardados en
Cloudflare D1 y sus imágenes en R2. Publicar un artículo no toca el código ni
dispara un rebuild: se escribe directo en la base de datos desde `/admin`.

## Qué incluye

```
├── src/                    → sitio Astro (páginas públicas + /admin + API)
├── migrations/0001_init.sql → esquema de la tabla `articles` en D1
├── worker-cleanup/         → Worker aparte con Cron Trigger diario que borra
│                             artículos vencidos (Worker independiente del sitio)
├── scripts/hash-password.mjs → genera el hash de la contraseña de admin
└── wrangler.jsonc          → bindings de D1, R2 y KV para el sitio principal
```

## 1. Requisitos

- Cuenta de Cloudflare (el plan gratuito alcanza)
- Node.js 18+
- `npm install -g wrangler` (o usar `npx wrangler`)
- Un repositorio en GitHub para este código

## 2. Crear los recursos de Cloudflare

```bash
# Login (abre el navegador)
npx wrangler login

# Base de datos D1
npx wrangler d1 create arbitraje_db
# copia el "database_id" que imprime y pégalo en:
#   - wrangler.jsonc (raíz)
#   - worker-cleanup/wrangler.toml

# Bucket R2 para las imágenes de portada
npx wrangler r2 bucket create arbitraje-images
```

Aplica el esquema a la base remota (la que usará el sitio en producción):

```bash
npm install
npm run db:migrate:remote
```

## 3. Generar la contraseña del panel de administración

El panel tiene un solo usuario. La contraseña nunca se guarda en texto plano,
solo su hash SHA-256:

```bash
node scripts/hash-password.mjs "tu-contraseña-segura"
```

Copia el hash que imprime, lo vas a necesitar en el paso 5.

## 4. Subir el código a GitHub

```bash
git init
git add .
git commit -m "Sitio inicial"
git branch -M main
git remote add origin https://github.com/tu-usuario/tu-repo.git
git push -u origin main
```

## 5. Desplegar el sitio en Cloudflare Workers

Desde Astro 6 el adaptador de Cloudflare **ya no soporta Cloudflare Pages**:
el sitio se despliega como un Worker con assets estáticos. Los bindings (D1,
R2, KV) y las variables públicas viven en `wrangler.jsonc`, así que no hay
que configurarlos a mano en el dashboard.

```bash
npm run deploy      # astro build && wrangler deploy
```

Si tenías el sitio conectado a Pages, sigue la guía de Cloudflare para migrar
de Pages a Workers (Workers & Pages → tu proyecto → conectar el repo como
Worker con build command `npm run build` y deploy command `npx wrangler deploy`).

Los secretos se guardan con Wrangler (no van en `wrangler.jsonc`):

```bash
npx wrangler secret put ADMIN_PASS_HASH
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
```

`ADMIN_USER`, `PUBLIC_TURNSTILE_SITE_KEY`, `RESEND_FROM_EMAIL` y
`ARBITROS_NOTIFY_EMAIL` **no** son secretos: ya están en `wrangler.jsonc` bajo
`vars` y se aplican solos con el deploy.

## 6. Desplegar el Worker de limpieza programada

Cloudflare Pages Functions no soportan Cron Triggers directamente, así que la
limpieza periódica corre en un Worker aparte y muy pequeño que comparte la
misma base D1 y el mismo bucket R2:

```bash
cd worker-cleanup
npm install
npx wrangler deploy
```

Por defecto corre todos los días a las 09:00 UTC y borra los artículos cuya
fecha de eliminación programada ya pasó (junto con su imagen en R2). Para
cambiar el horario, edita `crons` en `worker-cleanup/wrangler.toml`.

> Esto es un respaldo automático. Desde el panel `/admin` también hay un botón
> **"Ejecutar limpieza ahora"** por si quieres forzarla sin esperar al cron.

## 7. Desarrollo local

```bash
npm install
npm run db:migrate:local          # aplica el esquema a una D1 local (SQLite)

# crea un archivo .dev.vars (no se sube a git) con:
#   ADMIN_USER=admin
#   ADMIN_PASS_HASH=<el hash del paso 3>
#   SESSION_SECRET=cualquier-cadena-para-desarrollo

npm run build
npm run preview   # astro build + astro preview: corre el sitio en workerd con los bindings locales
```

## Cómo funciona la limpieza para no pasar los límites gratuitos

Cada artículo tiene un campo opcional **"Eliminación automática"** (7 / 14 /
30 / 90 días, o nunca). Si se elige un plazo:

1. El artículo se marca con una fecha de vencimiento (`expires_at`).
2. El Worker de cron lo borra automáticamente ese día, junto con su imagen en R2.
3. También puedes forzar la limpieza manualmente desde `/admin`.

Los límites gratuitos relevantes (a la fecha de este README) son generosos
para un blog de este tamaño: D1 permite 5 GB de almacenamiento y 5 millones
de filas leídas por día, y R2 incluye 10 GB de almacenamiento sin costo de
salida. Aun así, programar la eliminación de artículos temporales (por
ejemplo, coberturas de un torneo puntual) evita acumular imágenes sin usar.

## Notas técnicas

- **Editor de texto:** el panel usa Tiptap (ProseMirror) en modo Visual, y un
  cuadro de HTML en modo HTML. Produce solo el HTML que el sitio sabe mostrar
  y, además de texto, tablas y widgets (ver más abajo).
- **Seguridad del contenido:** el HTML se sanitiza en el servidor antes de
  guardarse (`src/lib/widgets/sanitize.ts`). Es una **lista blanca** con un
  parser HTML real: se reescribe la salida solo con etiquetas y atributos
  permitidos. No hay `<script>`, `<iframe>`, `<style>`, atributos `on*` ni
  esquemas peligrosos. Además, las rutas `/api` rechazan escrituras que no
  vengan de este mismo origen (CSRF) y las páginas HTML llevan una CSP
  (ver `src/lib/security.ts`).
- **Sesión de admin:** cookie firmada con HMAC-SHA256 (sin JWT ni tabla de
  sesiones), válida 7 días.
- **Versión de Astro:** el proyecto usa `astro@^7` y `@astrojs/cloudflare@^14`.
  Los bindings y secretos se leen con `import { env } from 'cloudflare:workers'`
  (ya no existe `Astro.locals.runtime`); el `ExecutionContext` está en
  `Astro.locals.cfContext`, la Cache API en el global `caches` (ver
  `src/lib/edge-cache.ts`) y el objeto `cf` en `Astro.request.cf`.

## Widgets en los artículos

Los artículos pueden llevar tableros de ajedrez, problemas interactivos,
trivias y contenido incrustado (Lichess, Chess.com, YouTube). Todo se ejecuta
en el navegador del lector y **no guarda nada en la base de datos** salvo la
configuración del propio widget, que viaja en el HTML del artículo.

**Cómo se usan:** en el editor, modo Visual, botones **Tablero**, **Problema**,
**Trivia** e **Incrustar**. Cada uno abre un formulario que valida los datos
y deja una vista previa en vivo dentro del editor. Un clic en *Editar* reabre
el formulario.

**Cómo funcionan por dentro:** el artículo guarda datos, nunca código:

```html
<figure data-widget="chess-puzzle" data-fen="…" data-solution="Qh7+ Kxh7 Rh3#">
  …contenido alternativo (texto) generado por el servidor…
</figure>
```

El código que los dibuja vive en `src/lib/widgets` y solo se descarga en los
artículos que tienen un widget. El contenido alternativo es lo que ven el RSS,
los buscadores y los lectores sin JavaScript.

| Archivo | Para qué |
|---|---|
| `schema.ts` | Qué es un widget válido (una sola fuente de verdad: servidor, editor y cliente) |
| `sanitize.ts` | Sanitizador de lista blanca; valida y normaliza los widgets al guardar |
| `client/mount.ts` | Inicia los widgets de la página (carga perezosa) |
| `client/board.ts` | Único punto donde se usa `cm-chessboard` |
| `client/game.ts` | Lógica de partida y de problema (solo `chess.js`, sin DOM) |
| `client/*.ts` | Un módulo por widget |
| `editor/*.ts` | Nodo de Tiptap y formularios del editor |
| `src/styles/widgets.css` | Toda la apariencia (paleta del tablero en las variables `--wg-*`) |

**Agregar un widget nuevo:** (1) añadir su tipo y su validación en `schema.ts`,
(2) crear `client/mi-widget.ts` con `export function mount(el, props)` y
registrarlo en `client/mount.ts`, (3) añadir su formulario en
`editor/widget-dialog.ts` y su botón en `RichEditor.astro`.

**Sitios permitidos para "Incrustar":** lista cerrada en `EMBED_HOSTS`
(`schema.ts`). Agregar uno es una línea; la CSP se ajusta sola.

**Piezas del tablero:** `public/widgets/pieces/standard.svg` son las piezas de
Colin M.L. Burnett (CC BY-SA 3.0); ver `public/widgets/LICENSES.txt`. Si
publicas una versión modificada de las piezas, debe llevar la misma licencia.

**CSP:** arranca en modo *Report-Only* (no bloquea, solo avisa en la consola
del navegador). Cuando hayas recorrido el sitio sin ver avisos legítimos,
cambia `CSP_ENFORCE` a `true` en `src/lib/security.ts`.

**Artículos anteriores:** el sanitizador actúa al guardar. Los artículos ya
guardados no se modifican hasta que se editen y se vuelvan a guardar.
