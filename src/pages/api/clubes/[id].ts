import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import {
  getClubById,
  updateClub,
  clubSlugExists,
  parseOrdenDestacado,
  parseModalidad,
  parseDiasImparte,
  type Actividad,
} from '../../../lib/clubes';
import { slugify } from '../../../lib/text';
import { uploadCoverImage, deleteImage } from '../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return redirect('/admin/clubes?error=' + encodeURIComponent('Identificador de club inválido.'));
  }

  const existing = await getClubById(env.DB, id);
  if (!existing) {
    return redirect('/admin/clubes?error=' + encodeURIComponent('Club no encontrado.'));
  }

  const form = await request.formData();
  const nombre = String(form.get('nombre') ?? '').trim();
  const pais = String(form.get('pais') ?? '').trim();
  const direccion = String(form.get('direccion') ?? '').trim() || null;
  const telefono = String(form.get('telefono') ?? '').trim() || null;
  const whatsapp = String(form.get('whatsapp') ?? '').trim() || null;
  const email = String(form.get('email') ?? '').trim() || null;
  const sitioWeb = String(form.get('sitio_web') ?? '').trim() || null;
  const diasImparte = parseDiasImparte(form);
  const modalidad = parseModalidad(form.get('modalidad'));
  const bio = String(form.get('bio') ?? '').trim() || null;
  const actividad = (String(form.get('actividad') ?? 'activo').trim() as Actividad) === 'inactivo' ? 'inactivo' : 'activo';
  const ordenDestacado = parseOrdenDestacado(form.get('orden_destacado'));
  const logoFile = form.get('logo') as File | null;
  const removeLogo = form.get('remove_logo') === 'on';

  if (!nombre) {
    return redirect(`/admin/clubes/editar/${id}?error=` + encodeURIComponent('El nombre del club es obligatorio.'));
  }
  if (!pais) {
    return redirect(`/admin/clubes/editar/${id}?error=` + encodeURIComponent('El país es obligatorio.'));
  }

  let slug = existing.slug;
  const newSlug = slugify(nombre);
  if (newSlug !== existing.slug && !(await clubSlugExists(env.DB, newSlug, id))) {
    slug = newSlug;
  }

  let logoKey = existing.logo_key;
  if (logoFile && logoFile.size > 0) {
    try {
      const uploaded = await uploadCoverImage(env.R2_IMAGES, logoFile, 'clubes');
      await deleteImage(env.R2_IMAGES, existing.logo_key);
      logoKey = uploaded;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir el logo.';
      return redirect(`/admin/clubes/editar/${id}?error=` + encodeURIComponent(msg));
    }
  } else if (removeLogo && existing.logo_key) {
    await deleteImage(env.R2_IMAGES, existing.logo_key);
    logoKey = null;
  }

  await updateClub(env.DB, id, {
    slug,
    nombre,
    pais,
    direccion,
    telefono,
    whatsapp,
    email,
    sitio_web: sitioWeb,
    dias_imparte: diasImparte,
    modalidad,
    logo_key: logoKey,
    bio,
    actividad,
    orden_destacado: ordenDestacado,
  });

  return redirect(`/admin/clubes?updated=${id}`);
};
