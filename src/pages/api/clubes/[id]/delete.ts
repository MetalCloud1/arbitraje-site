import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { deleteClub } from '../../../../lib/clubes';
import { deleteImage } from '../../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return redirect('/admin/clubes?error=' + encodeURIComponent('Identificador de club inválido.'));
  }

  const deleted = await deleteClub(env.DB, id);
  if (deleted?.logo_key) {
    await deleteImage(env.R2_IMAGES, deleted.logo_key);
  }

  return redirect('/admin/clubes?deleted=1');
};
