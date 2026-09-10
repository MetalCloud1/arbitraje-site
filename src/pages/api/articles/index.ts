import type { APIRoute } from 'astro';
import { createArticle, slugExists } from '../../../lib/db';
import { slugify, sanitizeHtml, estimateReadMinutes, excerptFromHtml } from '../../../lib/text';
import { uploadCoverImage } from '../../../lib/images';
import { computeExpiresAt } from '../../../lib/expiry';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const form = await request.formData();

  const title = String(form.get('title') ?? '').trim();
  const category = String(form.get('category') ?? '').trim();
  const publishedAt = String(form.get('published_at') ?? '').trim() || new Date().toISOString().slice(0, 10);
  const expiresOption = String(form.get('expires_option') ?? 'none');
  const contentHtmlRaw = String(form.get('content_html') ?? '');
  let excerpt = String(form.get('excerpt') ?? '').trim();
  const coverFile = form.get('cover') as File | null;

  if (!title || !category || !contentHtmlRaw.trim()) {
    return redirect('/admin/nuevo?error=' + encodeURIComponent('Título, categoría y contenido son obligatorios.'));
  }

  const contentHtml = sanitizeHtml(contentHtmlRaw);
  if (!excerpt) excerpt = excerptFromHtml(contentHtml);

  let slug = slugify(title);
  if (await slugExists(env.DB, slug)) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  let coverKey: string | null = null;
  if (coverFile && coverFile.size > 0) {
    try {
      coverKey = await uploadCoverImage(env.IMAGES, coverFile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir la imagen.';
      return redirect('/admin/nuevo?error=' + encodeURIComponent(msg));
    }
  }

  const id = await createArticle(env.DB, {
    slug,
    title,
    category,
    excerpt,
    content_html: contentHtml,
    cover_key: coverKey,
    read_minutes: estimateReadMinutes(contentHtml),
    published_at: publishedAt,
    expires_at: computeExpiresAt(expiresOption),
  });

  return redirect(`/admin?created=${id}`);
};
