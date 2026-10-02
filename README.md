# La Hora del Arbitraje — sitio + panel de administración

Sitio en Astro (SSR) desplegado en Cloudflare Workers, con artículos guardados en
Cloudflare D1 y sus imágenes en R2. Publicar un artículo no toca el código ni
dispara un rebuild: se escribe directo en la base de datos desde `/admin`.

## Qué incluye

```
├── src/                    → sitio Astro (páginas públicas + /admin + API)
├── migrations/0001_init.sql → esquema de la tabla `articles` en D1
├── worker-cleanup/         → Worker aparte con Cron Trigger diario que borra
│                             manda a la papelera los artículos vencidos
│                             (Worker independiente; no borra nada)
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
misma base D1 (no tiene acceso al bucket R2):

```bash
cd worker-cleanup
npm install
npx wrangler deploy
```

Por defecto corre todos los días a las 09:00 UTC y **manda a la papelera** los
artículos cuya fecha de eliminación programada ya pasó. No borra nada: ni filas
ni imágenes. Para cambiar el horario, edita `crons` en
`worker-cleanup/wrangler.toml`.

> Esto es un respaldo automático. Desde `/admin/zona-restringida` también hay un
> botón **"Enviar vencidos a la papelera"** para forzarlo sin esperar al cron. El
> borrado definitivo solo se hace ahí, desde la papelera, escribiendo ELIMINAR.

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

Cada artículo puede tener una **eliminación programada** (7 / 14 / 30 / 90
días, o ninguna), que se fija desde `/admin/zona-restringida`. Si se elige un
plazo:

1. El artículo se marca con una fecha de vencimiento (`expires_at`).
2. Ese día el Worker de cron lo **manda a la papelera** (se oculta del sitio,
   pero no se borra nada y se puede restaurar).
3. También puedes forzarlo manualmente desde `/admin/zona-restringida`.
4. El borrado definitivo (fila e imagen en R2) solo se hace desde la papelera,
   escribiendo ELIMINAR.

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
- **Caché de archivos estáticos:** `public/_headers` fija `Cache-Control`
  inmutable (1 año) para `/_astro/*` y `/fonts/*`, y plazos largos para íconos,
  texturas e imágenes de la raíz. Sin ese archivo Cloudflare manda
  `max-age=0, must-revalidate` y el navegador revalida todo en cada visita.
- **Fuentes:** Inter y Source Serif 4 se sirven desde `public/fonts/` (variables,
  licencia OFL) y se declaran en `src/styles/fonts.css`. No se usa Google Fonts.
- **Redirect www → sin www:** se hace a nivel de dominio con un *Bulk Redirect*
  de Cloudflare (Rules → Bulk Redirects): origen `www.lahoradelarbitraje.pro/`,
  destino `https://lahoradelarbitraje.pro/`, 301, con *Preserve query string*,
  *Subpath matching* y *Preserve path suffix* activados. Esto es lo que cubre las
  páginas prerenderizadas, que se sirven directo del CDN sin pasar por el
  middleware. El redirect de `src/middleware.ts` queda como respaldo para las
  rutas dinámicas. Requiere que el registro DNS de `www` tenga el proxy activado
  (nube naranja). Para comprobarlo:
  `curl -sI "https://www.lahoradelarbitraje.pro/sobre-nosotros?utm_source=x"`
  debe responder 301 con `location: https://lahoradelarbitraje.pro/sobre-nosotros?utm_source=x`.
- **Caché de páginas públicas (`src/middleware.ts` + `src/lib/edge-cache.ts`):**
  la clave de caché solo conserva los parámetros que cambian el HTML
  (`CACHE_KEY_PARAMS`: pais, estado, titulo, categoria, buscar); `utm_*`,
  `fbclid` y demás comparten entrada con la página limpia. **Si una página
  pública empieza a leer otro parámetro de la URL, agrégalo a esa lista** o
  mostrará el contenido de otra variante. Las respuestas llevan
  `X-Page-Cache: HIT|MISS` para comprobarlo en DevTools. El navegador reutiliza
  las fichas 60 s y los listados nunca (`max-age`), mientras el borde las guarda
  60 s / 5 min (`s-maxage`).
- **Búsquedas con `LIKE`:** D1 rechaza patrones de más de 50 bytes, por eso todas
  pasan por `likePattern()` (`src/lib/db.ts`), que recorta el término.
- **Optimizador de imágenes:** `src/lib/client/` convierte a WebP y comprime en el
  navegador las imágenes que se eligen en el panel. Se carga solo desde
  `AdminLayout.astro`, así que los visitantes públicos no lo descargan.
- **AdSense:** `BaseLayout.astro` no lo carga en páginas `noindex` (404, 410,
  formularios y perfiles sin contenido suficiente).
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
