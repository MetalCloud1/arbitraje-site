import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import {
  createClub,
  clubSlugExists,
  parseOrdenDestacado,
  parseModalidad,
  parseDiasImparte,
  type Actividad,
} from '../../../lib/clubes';
import { slugify } from '../../../lib/text';
import { uploadCoverImage } from '../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
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

  if (!nombre) {
    return redirect('/admin/clubes/nuevo?error=' + encodeURIComponent('El nombre del club es obligatorio.'));
  }
  if (!pais) {
    return redirect('/admin/clubes/nuevo?error=' + encodeURIComponent('El país es obligatorio.'));
  }

  let slug = slugify(nombre);
  if (await clubSlugExists(env.DB, slug)) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  let logoKey: string | null = null;
  if (logoFile && logoFile.size > 0) {
    try {
      logoKey = await uploadCoverImage(env.R2_IMAGES, logoFile, 'clubes');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir el logo.';
      return redirect('/admin/clubes/nuevo?error=' + encodeURIComponent(msg));
    }
  }

  const id = await createClub(env.DB, {
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

  return redirect(`/admin/clubes?created=${id}`);
};
