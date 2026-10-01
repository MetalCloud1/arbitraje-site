import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Inyecta el optimizador de imágenes (WebP + compresión) solo en el panel.
// Vive aquí para no tocar los layouts ni las páginas del admin.
const imageOptimizer = {
  name: 'image-optimizer',
  hooks: {
    'astro:config:setup': ({ injectScript }) => {
      injectScript(
        'page',
        "if (location.pathname.startsWith('/admin')) import('/src/lib/client/image-optimizer.ts');"
      );
    },
  },
};

export default defineConfig({
  integrations: [imageOptimizer],
  site: 'https://lahoradelarbitraje.pro',
  output: 'server',
  adapter: cloudflare({
    // `platformProxy` ya no existe: `astro dev` corre directamente en workerd
    // y toma los bindings de wrangler.jsonc y los secretos de .dev.vars.
    imageService: 'passthrough',
  }),
  session: false,
  // Astro 7 pasó el default a 'jsx' (elimina espacios entre elementos inline
  // en líneas distintas). Se mantiene el comportamiento anterior para no
  // alterar el texto del sitio.
  compressHTML: true,
  server: {
    port: 4321,
  },
});
