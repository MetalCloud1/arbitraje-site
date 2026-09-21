import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import {
  createEntrenador,
  entrenadorSlugExists,
  parseOrdenDestacado,
  parseEloClasico,
  type Actividad,
} from '../../../lib/entrenadores';
import { slugify } from '../../../lib/text';
import { uploadCoverImage } from '../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();

  const nombreCompleto = String(form.get('nombre_completo') ?? '').trim();
  const estadoRepublica = String(form.get('estado_republica') ?? '').trim() || null;
  const tituloAjedrez = String(form.get('titulo_ajedrez') ?? '').trim() || null;
  const tituloArbitraje = String(form.get('titulo_arbitraje') ?? '').trim() || null;
  const eloClasico = parseEloClasico(form.get('elo_clasico'));
  const fideId = String(form.get('fide_id') ?? '').trim() || null;
  const email = String(form.get('email') ?? '').trim() || null;
  const bio = String(form.get('bio') ?? '').trim() || null;
  const actividad = (String(form.get('actividad') ?? 'activo').trim() as Actividad) === 'inactivo' ? 'inactivo' : 'activo';
  const reclamado = form.get('reclamado') === 'on';
  const ordenDestacado = parseOrdenDestacado(form.get('orden_destacado'));
  const fotoFile = form.get('foto') as File | null;

  if (!nombreCompleto) {
    return redirect('/admin/entrenadores/nuevo?error=' + encodeURIComponent('El nombre completo es obligatorio.'));
  }

  if (form.get('elo_clasico') && eloClasico === null) {
    return redirect('/admin/entrenadores/nuevo?error=' + encodeURIComponent('El ELO clásico debe ser un número entero entre 0 y 3500.'));
  }

  let slug = slugify(nombreCompleto);
  if (await entrenadorSlugExists(env.DB, slug)) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  let fotoKey: string | null = null;
  if (fotoFile && fotoFile.size > 0) {
    try {
      fotoKey = await uploadCoverImage(env.R2_IMAGES, fotoFile, 'entrenadores');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir la foto.';
      return redirect('/admin/entrenadores/nuevo?error=' + encodeURIComponent(msg));
    }
  }

  const id = await createEntrenador(env.DB, {
    slug,
    nombre_completo: nombreCompleto,
    estado_republica: estadoRepublica,
    titulo_ajedrez: tituloAjedrez,
    titulo_arbitraje: tituloArbitraje,
    elo_clasico: eloClasico,
    fide_id: fideId,
    foto_key: fotoKey,
    email,
    bio,
    actividad,
    reclamado_en: reclamado ? new Date().toISOString() : null,
    orden_destacado: ordenDestacado,
  });

  return redirect(`/admin/entrenadores?created=${id}`);
};
