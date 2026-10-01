// Genera el hash SHA-256 de una contraseña para guardarlo como secreto en
// Cloudflare.
//
// Uso: node scripts/hash-password.mjs "mi-contraseña-segura" [NOMBRE_DEL_SECRETO]
//
//   Sin nombre            -> ADMIN_PASS_HASH (login normal del admin)
//   ADMIN_DANGER_PASS_HASH -> contraseña de la zona restringida (papelera/borrado)

import { createHash } from 'node:crypto';

const password = process.argv[2];
const secretName = process.argv[3] || 'ADMIN_PASS_HASH';

if (!password) {
  console.error('Uso: node scripts/hash-password.mjs "tu-contraseña" [NOMBRE_DEL_SECRETO]');
  process.exit(1);
}

const hash = createHash('sha256').update(password).digest('hex');
console.log(`\n${secretName}:`);
console.log(hash);
console.log(`\nGuárdalo con:\n  npx wrangler secret put ${secretName}\n(pega el hash de arriba cuando te lo pida)\n`);
