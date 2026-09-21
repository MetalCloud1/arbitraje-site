import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { deleteArticle } from '../../../../lib/db';
import { deleteImage } from '../../../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return redirect('/admin?error=' + encodeURIComponent('Identificador de artículo inválido.'));
  }

  const deleted = await deleteArticle(env.DB, id);
  if (deleted?.cover_key) {
    await deleteImage(env.R2_IMAGES, deleted.cover_key);
  }

  return redirect('/admin?deleted=1');
};
