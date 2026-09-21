import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { deleteExpiredArticles } from '../../lib/db';
import { deleteImage } from '../../lib/images';

export const prerender = false;

export const POST: APIRoute = async ({ redirect }) => {
  const coverKeys = await deleteExpiredArticles(env.DB);
  for (const key of coverKeys) {
    await deleteImage(env.R2_IMAGES, key);
  }
  return redirect(`/admin?cleaned=${coverKeys.length}`);
};
