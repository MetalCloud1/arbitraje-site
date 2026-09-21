// Genera el hash SHA-256 de una contraseña para usar como secreto
// ADMIN_PASS_HASH en Cloudflare Pages.
//
// Uso: node scripts/hash-password.mjs "mi-contraseña-segura"

import { createHash } from 'node:crypto';

const password = process.argv[2];

if (!password) {
  console.error('Uso: node scripts/hash-password.mjs "tu-contraseña"');
  process.exit(1);
}

const hash = createHash('sha256').update(password).digest('hex');
console.log('\nADMIN_PASS_HASH:');
console.log(hash);
console.log('\nGuárdalo con:\n  wrangler pages secret put ADMIN_PASS_HASH\n(pega el hash de arriba cuando te lo pida)\n');
