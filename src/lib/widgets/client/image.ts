// Sube UNA imagen y devuelve su clave de R2, para usarla dentro de un widget
// del artículo (galería, ficha de jugador/árbitro) mientras se está editando
// -- antes de guardar el artículo en sí, que es lo que hace `cover` en
// /api/articles. Reusa la misma función y el mismo bucket que la portada;
// solo cambia el prefijo, para poder distinguirlas en R2 si hace falta.
//
// La ruta ya queda protegida por el middleware (empieza con "/api/upload"),
// así que solo una sesión de administrador puede llegar hasta acá.

import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { uploadCoverImage } from '../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'No se pudo leer la imagen enviada.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return new Response(JSON.stringify({ error: 'No se recibió ninguna imagen.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const key = await uploadCoverImage(env.R2_IMAGES, file, 'articles');
    return new Response(JSON.stringify({ key, url: `/api/img/${key}` }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo subir la imagen.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
