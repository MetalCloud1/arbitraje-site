import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { uploadCoverImage } from '../../../lib/images';

export const prerender = false;

// Sube una imagen suelta usada por los widgets del editor (galería, ficha de
// perfil). La autenticación y el CSRF ya los resuelve el middleware para
// cualquier ruta bajo /api/upload; acá solo validamos el archivo y lo
// guardamos en R2 con el mismo helper que usan las fotos de portada.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return new Response(JSON.stringify({ error: 'No se recibió ninguna imagen.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const key = await uploadCoverImage(env.R2_IMAGES, file, 'widgets');
    return new Response(JSON.stringify({ key }), {
      status: 200,
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