# La Hora del Arbitraje

Sitio de noticias, análisis y directorios sobre arbitraje de ajedrez
(<https://lahoradelarbitraje.pro>), con panel de administración integrado.

Está hecho con Astro 7 en modo SSR sobre Cloudflare Workers. El contenido vive
en Cloudflare D1 y las imágenes en R2. Publicar o editar no requiere rebuild ni
deploy: se hace desde `/admin` y los cambios se escriben directo en la base.

## Qué hay en el sitio

### Páginas públicas

| Ruta | Qué muestra |
|---|---|
| `/` | Portada: artículos destacados y recientes, vista previa de árbitros, entrenadores y clubes, y el desafío diario (un tablero y una trivia). |
| `/articulos`, `/articulos/{slug}` | Listado con filtro por categoría (Casos, Entrevistas, Análisis, Podcast) y buscador. La ficha admite widgets, video de Facebook/YouTube y datos estructurados `NewsArticle`. |
| `/arbitros` | Portada de la sección: comunidad, actividad arbitral y avisos. |
| `/arbitros/directorio`, `/arbitros/{slug}` | Directorio de árbitros (filtros por estado y título, carga paginada) y ficha de cada uno. |
| `/entrenadores`, `/entrenadores/{slug}` | Directorio de entrenadores (filtros por estado y título de ajedrez) y ficha. |
| `/clubes`, `/clubes/{slug}` | Directorio de clubes (filtro por país) y ficha. |
| `/postular` | Formulario de alta o reclamo de perfil para árbitros y entrenadores. `/arbitros/postular` y `/entrenadores/postular` redirigen (301) aquí. |
| `/clubes/postular` | Formulario de alta de club. |
| `/sobre-nosotros`, `/politica-de-privacidad`, `/terminos-y-condiciones` | Páginas estáticas (prerenderizadas). |
| `/cursos`, `/formacion` | Páginas de marcador (componente `ComingSoon`), prerenderizadas y `noindex`. |
| `/rss.xml`, `/sitemap.xml`, `/news-sitemap.xml`, `/robots.txt` | Feed de los 20 artículos más recientes, sitemap general, sitemap de Google News (artículos de los últimos 3 días) y robots. |

El contenido que está en la papelera responde `410`; lo que no existe, `404`.

### Panel de administración

Un solo usuario. Todo vive bajo `/admin`:

- `/admin` y `/admin/nuevo`, `/admin/editar/{id}`: artículos.
- `/admin/arbitros`, `/admin/entrenadores`, `/admin/clubes`: alta y edición de perfiles. La lista de árbitros también muestra el uso de la cuota mensual de correo.
- `/admin/diario`: edita el desafío diario de la portada.
- `/admin/zona-restringida`: papelera, restauración, programación de vencimientos y borrado definitivo (segundo candado, ver [Seguridad](#seguridad)).

### API

Públicas (de solo lectura, salvo los formularios):

| Ruta | Para qué |
|---|---|
| `GET /api/search?q=` | Búsqueda de artículos (la usa el buscador del header). |
| `GET /api/{arbitros,entrenadores,clubes}/directorio` | Listados paginados con cursor (la usan los directorios al hacer scroll). |
| `GET /api/img/{clave}` | Sirve imágenes desde R2. |
| `POST /api/postular`, `POST /api/clubes/postular` | Envían un correo para revisión humana; no escriben en la base. |
| `POST /api/auth/login`, `POST /api/auth/logout` | Sesión de admin. |

Todo lo demás bajo `/api` (artículos, perfiles, subida de imágenes, desafío diario, zona restringida) exige sesión de admin.

## Stack

| Pieza | Uso |
|---|---|
| Astro 7 + `@astrojs/cloudflare` 14 | SSR en Cloudflare Workers con Static Assets |
| Cloudflare D1 (`arbitraje_db`, binding `DB`) | Artículos, perfiles, desafío diario, cuota de correo |
| Cloudflare R2 (`arbitraje-images`, binding `R2_IMAGES`) | Imágenes de portada y de widgets |
| Cloudflare KV (binding `RATE_LIMIT_KV`) | Límites de intentos (login y formularios) |
| Cloudflare Turnstile | Antibots en login y formularios |
| Resend | Correos de revisión de postulaciones |
| Tiptap | Editor de artículos |
| chess.js + cm-chessboard | Widgets de ajedrez |
| htmlparser2 | Sanitizador de HTML |

Node.js 22 (ver `.node-version`).

## Estructura del repositorio

```
├── src/
│   ├── pages/              → rutas públicas, /admin y /api
│   ├── components/         → componentes de las páginas
│   ├── layouts/            → BaseLayout (sitio) y AdminLayout (panel)
│   ├── lib/                → lógica compartida (ver tabla abajo)
│   ├── middleware.ts       → redirect www, CSRF, sesión, candados y caché de páginas
│   └── styles/             → global.css, fonts.css, widgets.css
├── public/                 → estáticos: fuentes, íconos, texturas, piezas del tablero
│   └── _headers            → Cache-Control y cabeceras de los estáticos
├── migrations/             → esquema de D1 (0001 a 0008)
├── worker-cleanup/         → Worker aparte con un cron diario (ver más abajo)
├── scripts/hash-password.mjs → genera hashes de contraseña para los secretos
├── astro.config.mjs
└── wrangler.jsonc          → bindings, variables y configuración de assets
```

### Módulos de `src/lib`

| Archivo | Para qué |
|---|---|
| `db.ts` | Consultas de artículos; `likePattern()` para búsquedas con `LIKE` |
| `arbitros.ts`, `entrenadores.ts`, `clubes.ts` | Consultas y tipos de cada directorio (paginación con cursor) |
| `postulacion.ts`, `club-postulacion.ts` | Validación de los formularios públicos y armado del correo |
| `paises.ts`, `titulos-ajedrez.ts` | Listas cerradas de países y de títulos de ajedrez |
| `auth.ts` | Sesión admin, zona restringida y contraseñas |
| `security.ts` | CSP, protección CSRF y cabeceras de seguridad |
| `edge-cache.ts` | Caché de borde y claves de caché canónicas |
| `email.ts`, `turnstile.ts` | Envío con Resend (con cuota mensual) y verificación de Turnstile |
| `papelera.ts`, `expiry.ts` | Papelera, borrado definitivo y vencimientos programados |
| `daily.ts` | Desafío diario de la portada |
| `feed.ts` | Armado de RSS y sitemap de noticias |
| `seo.ts` | Regla de indexación de perfiles |
| `images.ts` | Subida y borrado de imágenes en R2 |
| `site.ts` | Nombre, dominio, correo de contacto y redes del sitio |
| `video.ts`, `text.ts` | Videos de Facebook/YouTube y utilidades de texto y fechas |
| `widgets/` | Widgets de los artículos y sanitizador (ver [Widgets](#widgets-en-los-artículos)) |
| `client/` | Optimizador de imágenes del panel (corre en el navegador) |

## Base de datos (D1)

| Tabla | Contenido |
|---|---|
| `articles` | Artículos. `expires_at` programa su envío a la papelera; `video_url` tiene prioridad sobre `cover_key` |
| `arbitros` | Directorio de árbitros |
| `entrenadores` | Directorio de entrenadores (título de ajedrez, título de arbitraje, ELO clásico) |
| `clubes` | Directorio de clubes (país de una lista fija, modalidad, días) |
| `daily_challenge` | Una sola fila (`id = 1`) con el tablero y la trivia de la portada |
| `email_quota` | Contador mensual de correos enviados con Resend |

Los perfiles se cargan a mano desde `/admin`; los formularios públicos solo
mandan un correo. `orden_destacado` (opcional) fija un orden manual antes del
alfabético. `reclamado_en` marca los perfiles que su dueño ya verificó.
`deleted_at` (en artículos, árbitros, entrenadores y clubes) es la marca de la
papelera.

| Migración | Qué agrega |
|---|---|
| `0001_init.sql` | Tabla `articles` |
| `0002_add_video_url.sql` | Columna `video_url` |
| `0003_arbitros.sql` | Tablas `arbitros` y `email_quota` |
| `0004_featured_order.sql` | `orden_destacado` en árbitros |
| `0005_entrenadores.sql` | Tabla `entrenadores` |
| `0006_clubes.sql` | Tabla `clubes` |
| `0007_daily_challenge.sql` | Tabla `daily_challenge` con una fila inicial |
| `0008_papelera.sql` | Columna `deleted_at` en las cuatro tablas de contenido |

### Aplicar migraciones

En una base nueva (local o remota), se aplican todas en orden:

```bash
npx wrangler d1 migrations apply arbitraje_db --local     # base local
npx wrangler d1 migrations apply arbitraje_db --remote    # base de producción
```

Si una base ya tuvo migraciones aplicadas a mano con `execute --file`, Wrangler
no las tiene registradas y `migrations apply` intentaría repetirlas. Las
migraciones `0002`, `0004` y `0008` usan `ALTER TABLE ... ADD COLUMN` y fallarían
con `duplicate column name`. En ese caso hay que correr solo las nuevas:

```bash
npx wrangler d1 execute arbitraje_db --remote --file=./migrations/0009_nombre.sql
```

> Los scripts `db:migrate:local` y `db:migrate:remote` de `package.json` solo
> aplican `0001_init.sql`. No sirven para dejar una base completa.

Aplica las migraciones nuevas **antes** de desplegar el código que las usa:
el código consulta las columnas nuevas y fallaría sin ellas.

## Configuración

### Variables (en `wrangler.jsonc`, no son secretas)

| Variable | Uso |
|---|---|
| `ADMIN_USER` | Usuario del panel |
| `PUBLIC_TURNSTILE_SITE_KEY` | Clave pública de Turnstile |
| `RESEND_FROM_EMAIL` | Remitente de los correos |
| `ARBITROS_NOTIFY_EMAIL` | Destino de las postulaciones de árbitros |
| `ENTRENADORES_NOTIFY_EMAIL`, `CLUBES_NOTIFY_EMAIL` | Opcionales: destino de cada tipo. Si faltan, se usa `ARBITROS_NOTIFY_EMAIL` |

### Secretos

Se guardan con Wrangler (no van en `wrangler.jsonc`):

```bash
npx wrangler secret put ADMIN_PASS_HASH
npx wrangler secret put ADMIN_DANGER_PASS_HASH
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
```

- `ADMIN_PASS_HASH`: hash SHA-256 de la contraseña del panel.
- `ADMIN_DANGER_PASS_HASH`: hash SHA-256 de la contraseña de la zona restringida. Si no existe, esa zona queda cerrada para todos.
- `SESSION_SECRET`: clave con la que se firman las cookies de sesión.

Los hashes se generan así (la contraseña nunca se guarda en texto plano):

```bash
node scripts/hash-password.mjs "tu-contraseña"                          # ADMIN_PASS_HASH
node scripts/hash-password.mjs "otra-contraseña" ADMIN_DANGER_PASS_HASH # zona restringida
```

### Crear el entorno desde cero

```bash
npx wrangler login
npx wrangler d1 create arbitraje_db
npx wrangler r2 bucket create arbitraje-images
npx wrangler kv namespace create RATE_LIMIT_KV
```

Pega el `database_id` en `wrangler.jsonc` y en `worker-cleanup/wrangler.toml`,
y el `id` del namespace de KV en `wrangler.jsonc`. Luego aplica las migraciones
y carga los secretos.

## Desarrollo local

```bash
npm install
npx wrangler d1 migrations apply arbitraje_db --local
npm run dev        # astro dev, corre en workerd con los bindings de wrangler.jsonc
```

Crea un archivo `.dev.vars` (está en `.gitignore`) con los secretos:

```
ADMIN_USER=admin
ADMIN_PASS_HASH=<hash>
ADMIN_DANGER_PASS_HASH=<hash>
SESSION_SECRET=<cualquier cadena>
TURNSTILE_SECRET_KEY=<clave>
RESEND_API_KEY=<clave>
```

`npm run preview` hace `astro build` y levanta el resultado en workerd con los
bindings locales.

## Despliegue

```bash
npm run deploy     # astro build && wrangler deploy
```

El sitio se despliega como un Worker con assets estáticos (el adaptador de
Cloudflare ya no soporta Pages). Los bindings y las variables salen de
`wrangler.jsonc`.

En `wrangler.jsonc`:

- Los estáticos y las páginas prerenderizadas (`/sobre-nosotros`,
  `/politica-de-privacidad`, `/terminos-y-condiciones`, `/cursos`, `/formacion`)
  se sirven directo desde el CDN, sin invocar el Worker.
- `assets.html_handling: "drop-trailing-slash"`: el sitio usa URLs sin barra
  final, y `/ruta/` redirige a `/ruta`.

### Worker de limpieza (`worker-cleanup/`)

Es un Worker aparte con un cron diario a las 09:00 UTC (se cambia en `crons`,
dentro de `worker-cleanup/wrangler.toml`). Comparte la misma base D1 y **no**
tiene acceso a R2. Manda a la papelera los artículos cuya fecha de vencimiento
(`expires_at`) ya pasó. No borra nada.

```bash
cd worker-cleanup
npm install
npx wrangler deploy
```

## Papelera y borrado

Nada se borra al instante. Quitar contenido del sitio es marcar `deleted_at`:
queda oculto, su URL responde `410` y se puede restaurar. El flujo vive en
`/admin/zona-restringida` (`src/lib/papelera.ts`, `/api/zona/*`):

- **Enviar a la papelera / restaurar:** para artículos, árbitros, entrenadores y clubes.
- **Programar:** a un artículo se le puede fijar un vencimiento (7, 14, 30 o 90 días). Al llegar la fecha, el Worker de limpieza lo manda a la papelera.
- **Enviar vencidos a la papelera:** botón para hacerlo sin esperar al cron.
- **Borrado definitivo:** solo para lo que ya está en la papelera y escribiendo `ELIMINAR`. Es lo único que borra la fila y su imagen en R2.

`/api/cleanup` y las rutas `delete` responden `410` a propósito.

## Seguridad

- **Login:** un solo usuario. La contraseña se compara contra un hash SHA-256. La sesión es una cookie firmada con HMAC-SHA256 (`arbitraje_session`, `HttpOnly`, `SameSite=Lax`, 7 días), sin JWT ni tabla de sesiones. El login tiene Turnstile y un límite de 5 intentos cada 15 minutos (KV).
- **Zona restringida:** segundo candado con otra contraseña (`ADMIN_DANGER_PASS_HASH`). Da una cookie aparte (`arbitraje_zona`, `SameSite=Strict`, 15 minutos), firmada con otra clave derivada y atada al usuario de la sesión. Si el secreto no existe, la zona queda cerrada. El middleware aplica este candado a todo `/api/zona/*` salvo `acceso` y `salir`.
- **Rutas protegidas:** el middleware exige sesión para `/admin` (salvo `/admin/login`) y para los prefijos `/api/articles`, `/api/arbitros`, `/api/entrenadores`, `/api/clubes`, `/api/upload`, `/api/cleanup`, `/api/zona` y `/api/daily`. Las excepciones públicas están en `PUBLIC_API_PATHS` (`middleware.ts`). **Si agregas un endpoint público bajo uno de esos prefijos, súmalo a esa lista.**
- **CSRF:** las escrituras (`POST`, `PUT`, `PATCH`, `DELETE`) a `/api` solo se aceptan del mismo origen.
- **HTML de los artículos:** se sanitiza en el servidor antes de guardarse (`src/lib/widgets/sanitize.ts`) con una lista blanca y un parser HTML real: solo pasan las etiquetas, atributos y clases permitidos. No hay `<script>`, `<iframe>`, `<style>`, atributos `on*` ni esquemas peligrosos.
- **Cabeceras:** las páginas HTML llevan `X-Content-Type-Options` y `Referrer-Policy` (las prerenderizadas las traen desde `public/_headers`). La CSP (`src/lib/security.ts`) está hoy en modo *Report-Only* (`CSP_ENFORCE = false`): el navegador avisa en consola, pero no bloquea.

## Formularios públicos y correo

`/postular` (árbitros y entrenadores) y `/clubes/postular` no crean perfiles:
mandan un correo para que una persona lo revise y cargue el perfil desde `/admin`.

Cada envío pasa por:

1. Límite por IP de 4 envíos por hora (KV). Árbitros y entrenadores lo comparten; clubes tiene el suyo.
2. Honeypot.
3. Turnstile (verifica también la acción y el hostname).
4. Cuota mensual de Resend: un contador propio en D1 (`email_quota`) corta en 2950 envíos al mes, antes de llamar a la API.

## Cachés y rendimiento

- **Estáticos (`public/_headers`):** `/_astro/*` y `/fonts/*` llevan caché inmutable de un año. Íconos, texturas y widgets, 30 días. Las imágenes y logos de la raíz, una semana. Sin ese archivo, Cloudflare manda `max-age=0, must-revalidate`.
- **Páginas públicas (`src/middleware.ts` + `src/lib/edge-cache.ts`):** las respuestas HTML `GET` sin sesión se guardan en la Cache API. Los listados duran 60 s en el borde y las fichas 300 s. El navegador reutiliza las fichas 60 s y los listados nunca. La respuesta lleva `X-Page-Cache: HIT|MISS`. La Cache API guarda una copia por centro de datos de Cloudflare.
- **Clave de caché:** solo conserva los parámetros que cambian el HTML (`CACHE_KEY_PARAMS`: `pais`, `estado`, `titulo`, `categoria`, `buscar`). `utm_*`, `fbclid` y demás comparten entrada con la página limpia. **Si una página pública empieza a leer otro parámetro de la URL, agrégalo a esa lista** o mostrará el contenido de otra variante. Cada endpoint `/api/*/directorio` tiene su propia lista.
- **APIs y feeds:** los directorios se cachean 120 s, la búsqueda 60 s, el RSS y el sitemap de noticias 300 s (con `ETag`) y `sitemap.xml` 30 minutos.
- **Imágenes (`/api/img/*`):** caché de borde con `immutable` de un año y `ETag`. Un 404 se cachea 60 s. Las claves llevan marca de tiempo y UUID, así que el contenido de una clave nunca cambia.
- **Fuentes:** Inter y Source Serif 4 se sirven desde `public/fonts/` (variables, licencia OFL) y se declaran en `src/styles/fonts.css`. No se usa Google Fonts.
- **Búsquedas con `LIKE`:** D1 rechaza patrones de más de 50 bytes, por eso todas pasan por `likePattern()` (`src/lib/db.ts`), que recorta el término.

## Contenido e imágenes

- **Editor:** Tiptap en modo Visual y un cuadro de HTML en modo HTML. Produce solo el HTML que el sitio sabe mostrar (texto, tablas, imágenes y widgets).
- **Categorías de artículo:** Análisis, Casos, Entrevistas, Podcast, Actividad Arbitral y Avisos (se definen en `src/pages/admin/nuevo.astro` y `editar/[id].astro`). `/articulos` filtra por las cuatro primeras; Actividad Arbitral y Avisos aparecen en `/arbitros`.
- **Imágenes:** JPG, PNG, WEBP o GIF, hasta 5 MB. El panel las convierte a WebP y las comprime en el navegador antes de subirlas (`src/lib/client/`, solo se carga en `AdminLayout.astro`). Se guardan en R2 con clave `covers/…` (portadas) o `widgets/…` (widgets) y se sirven solo por `/api/img/{clave}`.
- **Video:** un artículo puede llevar un video de Facebook o YouTube (`video_url`); tiene prioridad sobre la portada.

## Widgets en los artículos

Los artículos pueden llevar tableros de ajedrez, problemas, trivias, imágenes o
galerías y contenido incrustado. Todo se ejecuta en el navegador del lector y
**no guarda nada en la base de datos**, salvo la configuración del propio widget,
que viaja en el HTML del artículo.

| Tipo | Qué es |
|---|---|
| `chess-board` | Posición fija o partida que se reproduce jugada a jugada |
| `chess-puzzle` | El lector mueve las piezas y se valida contra la solución |
| `quiz` | Trivia de opción múltiple, una pregunta a la vez |
| `embed` | `<iframe>` de un sitio de la lista blanca |
| `gallery` | Una imagen o varias en mosaico, con visor a pantalla completa |

**Cómo se usan:** en el editor, modo Visual, hay un botón por tipo de widget.
Cada uno abre un formulario que valida con el mismo esquema que el servidor y
muestra una vista previa en vivo. Un clic en *Editar* lo reabre.

**Cómo funcionan por dentro:** el artículo guarda datos, nunca código:

```html
<figure data-widget="chess-puzzle" data-fen="…" data-solution="Qh7+ Kxh7 Rh3#">
  …contenido alternativo (texto) generado por el servidor…
</figure>
```

El código que los dibuja solo se descarga en los artículos que tienen un
widget, y cada tipo carga su módulo cuando se acerca a la pantalla. El
contenido alternativo es lo que ven el RSS, los buscadores y los lectores sin
JavaScript.

| Archivo (`src/lib/widgets/`) | Para qué |
|---|---|
| `schema.ts` | Qué es un widget válido (única fuente de verdad: servidor, editor y cliente) |
| `sanitize.ts` | Sanitizador de lista blanca; valida y normaliza los widgets al guardar |
| `article-classes.ts` | Clases CSS permitidas en los artículos (tamaño y alineación de imágenes, recuadros) |
| `client/mount.ts` | Inicia los widgets de la página |
| `client/board.ts` | Único punto donde se usa `cm-chessboard` |
| `client/game.ts` | Lógica de partida y de problema (solo `chess.js`, sin DOM) |
| `client/chess-board.ts`, `chess-puzzle.ts`, `quiz.ts`, `embed.ts`, `gallery.ts` | Un módulo por tipo de widget |
| `client/image.ts` | Sube una imagen desde el editor y devuelve su clave de R2 |
| `editor/*.ts` | Nodos de Tiptap y formularios del editor |
| `src/styles/widgets.css` | Toda la apariencia (paleta del tablero en las variables `--wg-*`) |

**Agregar un widget nuevo:**

1. Añadir su tipo y su validación en `schema.ts`.
2. Crear `client/mi-widget.ts` con `export function mount(el, props)` y registrarlo en `client/mount.ts`.
3. Añadir su formulario en `editor/widget-dialog.ts` y su botón en `RichEditor.astro`.

**Sitios permitidos para "Incrustar":** lista cerrada en `EMBED_HOSTS`
(`schema.ts`): Lichess, Chess.com y YouTube. Agregar uno es una línea; la CSP se
ajusta sola.

**Piezas del tablero:** `public/widgets/pieces/standard.svg` son las piezas de
Colin M.L. Burnett (CC BY-SA 3.0); ver `public/widgets/LICENSES.txt`. Una
versión modificada de las piezas debe llevar la misma licencia.

**Artículos anteriores:** el sanitizador actúa al guardar. Los artículos ya
guardados no cambian hasta que se editen y se vuelvan a guardar.

## SEO e indexación

- Cada página declara su `canonical` sin barra final. `/sitemap.xml` y `/news-sitemap.xml` se generan en cada petición leyendo D1.
- Un perfil (árbitro, entrenador o club) se indexa solo si su biografía tiene al menos 300 palabras (`src/lib/seo.ts`). Los demás llevan `noindex` y no entran al sitemap.
- Las páginas `noindex` (404, 410, formularios, perfiles sin contenido suficiente, `/cursos`, `/formacion`) no cargan AdSense (`BaseLayout.astro`).
- `public/` incluye los archivos de verificación de Bing y la clave de IndexNow.

## Dominio y Cloudflare

**Redirect www → sin www:** se hace a nivel de dominio con un *Bulk Redirect*
de Cloudflare (Rules → Bulk Redirects): origen `www.lahoradelarbitraje.pro/`,
destino `https://lahoradelarbitraje.pro/`, 301, con *Preserve query string*,
*Subpath matching* y *Preserve path suffix* activados. Esto cubre las páginas
prerenderizadas, que se sirven del CDN sin pasar por el middleware. El redirect
de `src/middleware.ts` queda como respaldo para las rutas dinámicas (excluye
`/api/` para no convertir un `POST` en `GET`). Requiere que el registro DNS de
`www` tenga el proxy activado (nube naranja). Para comprobarlo:

```bash
curl -sI "https://www.lahoradelarbitraje.pro/sobre-nosotros?utm_source=x"
# debe responder 301 con: location: https://lahoradelarbitraje.pro/sobre-nosotros?utm_source=x
```

## Notas técnicas

- **Astro 7 y `@astrojs/cloudflare` 14:** los bindings y secretos se leen con `import { env } from 'cloudflare:workers'` (ya no existe `Astro.locals.runtime`). El `ExecutionContext` está en `Astro.locals.cfContext`, la Cache API en el global `caches` (ver `src/lib/edge-cache.ts`) y el objeto `cf` en `Astro.request.cf`.
- **Navegación:** el sitio usa el `ClientRouter` de Astro, así que los scripts de cada página (buscador, barra de lectura, widgets) se inician de forma idempotente y se limpian al salir.
- **Datos del sitio:** nombre, dominio, correo de contacto, redes y fecha de las páginas legales están en `src/lib/site.ts`.
- **Tipos del entorno:** `src/env.d.ts` se mantiene a mano; al cambiar `wrangler.jsonc` o los secretos hay que reflejarlo ahí.