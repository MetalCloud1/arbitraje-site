import type { APIRoute } from 'astro';
import { getArbitroById, updateArbitro, arbitroSlugExists, parseOrdenDestacado, type Actividad } from '../../../lib/arbitros';
import { slugify } from '../../../lib/text';
import { uploadCoverImage, deleteImage } from '../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const env = locals.runtime.env;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return redirect('/admin/arbitros?error=' + encodeURIComponent('Identificador de árbitro inválido.'));
  }

  const existing = await getArbitroById(env.DB, id);
  if (!existing) {
    return redirect('/admin/arbitros?error=' + encodeURIComponent('Árbitro no encontrado.'));
  }

  const form = await request.formData();
  const nombreCompleto = String(form.get('nombre_completo') ?? '').trim();
  const estadoRepublica = String(form.get('estado_republica') ?? '').trim() || null;
  const titulo = String(form.get('titulo') ?? '').trim() || null;
  const fideId = String(form.get('fide_id') ?? '').trim() || null;
  const email = String(form.get('email') ?? '').trim() || null;
  const bio = String(form.get('bio') ?? '').trim() || null;
  const actividad = (String(form.get('actividad') ?? 'activo').trim() as Actividad) === 'inactivo' ? 'inactivo' : 'activo';
  const reclamado = form.get('reclamado') === 'on';
  const ordenDestacado = parseOrdenDestacado(form.get('orden_destacado'));
  const fotoFile = form.get('foto') as File | null;
  const removeFoto = form.get('remove_foto') === 'on';

  if (!nombreCompleto) {
    return redirect(`/admin/arbitros/editar/${id}?error=` + encodeURIComponent('El nombre completo es obligatorio.'));
  }

  let slug = existing.slug;
  const newSlug = slugify(nombreCompleto);
  if (newSlug !== existing.slug && !(await arbitroSlugExists(env.DB, newSlug, id))) {
    slug = newSlug;
  }

  let fotoKey = existing.foto_key;
  if (fotoFile && fotoFile.size > 0) {
    try {
      const uploaded = await uploadCoverImage(env.IMAGES, fotoFile, 'arbitros');
      await deleteImage(env.IMAGES, existing.foto_key);
      fotoKey = uploaded;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir la foto.';
      return redirect(`/admin/arbitros/editar/${id}?error=` + encodeURIComponent(msg));
    }
  } else if (removeFoto && existing.foto_key) {
    await deleteImage(env.IMAGES, existing.foto_key);
    fotoKey = null;
  }

  // No pisamos reclamado_en con "ahora" en cada guardado: si ya estaba
  // reclamado, conserva la fecha original; si se destilda, se limpia.
  const reclamadoEn = reclamado ? existing.reclamado_en ?? new Date().toISOString() : null;

  await updateArbitro(env.DB, id, {
    slug,
    nombre_completo: nombreCompleto,
    estado_republica: estadoRepublica,
    titulo,
    fide_id: fideId,
    foto_key: fotoKey,
    email,
    bio,
    actividad,
    reclamado_en: reclamadoEn,
    orden_destacado: ordenDestacado,
  });

  return redirect(`/admin/arbitros?updated=${id}`);
};
