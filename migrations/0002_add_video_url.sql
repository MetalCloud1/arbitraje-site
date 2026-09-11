-- Agrega soporte para artículos cuyo contenido audiovisual es un video
-- alojado en Facebook o YouTube, en vez de una imagen de portada subida a R2.
-- Si video_url no es NULL, se prioriza sobre cover_key al mostrar el artículo.
ALTER TABLE articles ADD COLUMN video_url TEXT;
