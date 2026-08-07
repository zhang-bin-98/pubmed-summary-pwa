import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('public/icons', { recursive: true });
const svg = (size, inset = 0) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" rx="88" fill="#176b5b"/><rect x="${116 + inset}" y="${86 + inset}" width="${280 - inset * 2}" height="${340 - inset * 2}" rx="28" fill="#fff"/><path d="M170 180h172M170 238h172M170 296h108" stroke="#176b5b" stroke-width="24" stroke-linecap="round"/><circle cx="338" cy="330" r="58" fill="#f0b429"/><path d="m378 372 48 48" stroke="#17211f" stroke-width="24" stroke-linecap="round"/></svg>`);
await sharp(svg(512)).resize(192, 192).png().toFile('public/icons/pwa-192.png');
await sharp(svg(512)).png().toFile('public/icons/pwa-512.png');
await sharp(svg(512, 28)).png().toFile('public/icons/pwa-maskable-512.png');
