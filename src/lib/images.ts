const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadCoverImage(bucket: R2Bucket, file: File): Promise<string> {
  if (!(file.type in EXT_BY_TYPE)) {
    throw new Error('Formato de imagen no soportado. Usa JPG, PNG, WEBP o GIF.');
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('La imagen supera el límite de 5 MB.');
  }

  const ext = EXT_BY_TYPE[file.type];
  const key = `covers/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  return key;
}

export async function deleteImage(bucket: R2Bucket, key: string | null | undefined): Promise<void> {
  if (!key) return;
  await bucket.delete(key);
}
