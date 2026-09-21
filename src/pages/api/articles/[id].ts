import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { getArticleById, updateArticle, slugExists } from '../../../lib/db';
import { slugify, sanitizeArticleHtml, estimateReadMinutes, excerptFromHtml } from '../../../lib/text';
import { uploadCoverImage, deleteImage } from '../../../lib/images';
import { parseVideoUrl } from '../../../lib/video';
import { computeExpiresAt } from '../../../lib/expiry';

export const prerender = false;

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return redirect('/admin?error=' + encodeURIComponent('Identificador de artículo inválido.'));
  }
  const existing = await getArticleById(env.DB, id);

  if (!existing) {
    return redirect('/admin?error=' + encodeURIComponent('Artículo no encontrado.'));
  }

  const form = await request.formData();
  const title = String(form.get('title') ?? '').trim();
  const category = String(form.get('category') ?? '').trim();
  const publishedAt = String(form.get('published_at') ?? '').trim() || existing.published_at;
  const expiresOption = String(form.get('expires_option') ?? 'none');
  const contentHtmlRaw = String(form.get('content_html') ?? '');
  let excerpt = String(form.get('excerpt') ?? '').trim();
  const coverFile = form.get('cover') as File | null;
  const removeCover = form.get('remove_cover') === 'on';
  const videoUrlRaw = String(form.get('video_url') ?? '').trim();
  const removeVideo = form.get('remove_video') === 'on';

  if (!title || !category || !contentHtmlRaw.trim()) {
    return redirect(`/admin/editar/${id}?error=` + encodeURIComponent('Título, categoría y contenido son obligatorios.'));
  }

  let videoUrl: string | null = existing.video_url;
  if (removeVideo) {
    videoUrl = null;
  } else if (videoUrlRaw) {
    try {
      videoUrl = parseVideoUrl(videoUrlRaw).originalUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'El link de video no es válido.';
      return redirect(`/admin/editar/${id}?error=` + encodeURIComponent(msg));
    }
  }

  const sanitized = sanitizeArticleHtml(contentHtmlRaw);
  if (sanitized.errors.length > 0) {
    return redirect(`/admin/editar/${id}?error=` + encodeURIComponent('Un widget del artículo no es válido: ' + sanitized.errors[0]));
  }
  const contentHtml = sanitized.html;
  if (!excerpt) excerpt = excerptFromHtml(contentHtml);

  let slug = existing.slug;
  const newSlug = slugify(title);
  if (newSlug !== existing.slug && !(await slugExists(env.DB, newSlug, id))) {
    slug = newSlug;
  }

  let coverKey = existing.cover_key;
  if (coverFile && coverFile.size > 0) {
    try {
      const uploaded = await uploadCoverImage(env.R2_IMAGES, coverFile);
      await deleteImage(env.R2_IMAGES, existing.cover_key);
      coverKey = uploaded;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir la imagen.';
      return redirect(`/admin/editar/${id}?error=` + encodeURIComponent(msg));
    }
  } else if (removeCover && existing.cover_key) {
    await deleteImage(env.R2_IMAGES, existing.cover_key);
    coverKey = null;
  }

  await updateArticle(env.DB, id, {
    slug,
    title,
    category,
    excerpt,
    content_html: contentHtml,
    cover_key: coverKey,
    video_url: videoUrl,
    read_minutes: estimateReadMinutes(contentHtml),
    published_at: publishedAt,
    expires_at: computeExpiresAt(expiresOption),
  });

  return redirect(`/admin?updated=${id}`);
};