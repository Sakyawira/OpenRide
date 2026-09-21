import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

// All bundled copies and raster exports derive from the editable vector master.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SVG = await readFile(resolve(ROOT, 'openride-design-system/assets/brand/logo.svg'), 'utf8');
const MARK = SVG.replace(/<svg[^>]*>/, '').replace('</svg>', '');
const OUTPUTS = new Map();
const BACKGROUND = '#EFFFFF';
const FLUTTER_APPS = ['openride-driver-frontend', 'openride-rider-frontend'];

function icon(scale, background = BACKGROUND, rounded = false) {
  const offset = (256 - 256 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
    ${background ? `<rect x="0" y="0" width="256" height="256" rx="${rounded ? 54 : 0}" fill="${background}"/>` : ''}
    <g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>
  </svg>`;
}

async function save(path, data) {
  const destination = resolve(ROOT, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, data);
}

async function png(path, size, svg, opaque = false) {
  const pipeline = sharp(Buffer.from(svg), { density: 288 }).resize(size, size);
  // iOS app icons must not contain an alpha channel, even if fully opaque.
  if (opaque) pipeline.removeAlpha();
  const data = await pipeline.png().toBuffer();
  await save(path, data);
  OUTPUTS.set(path, size);
}

for (const webRoot of [
  ...FLUTTER_APPS.map((app) => `${app}/web`),
  'openride-design-system/catalog/web',
]) {
  await save(`${webRoot}/logo.svg`, SVG);
  await save(`${webRoot}/favicon.svg`, icon(0.94));
  await png(`${webRoot}/favicon.png`, 48, icon(0.94));
  for (const size of [192, 512]) {
    await png(`${webRoot}/icons/Icon-${size}.png`, size, icon(0.86));
    // Keep the entire mark within the central maskable safe circle.
    await png(`${webRoot}/icons/Icon-maskable-${size}.png`, size, icon(0.66));
  }
}
for (const app of FLUTTER_APPS) {
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    await png(
      `${app}/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_${size}.png`,
      size,
      icon(0.84, BACKGROUND, true)
    );
  }

  const IOS_ROOT = `${app}/ios/Runner/Assets.xcassets`;
  const IOS_CONTENTS = JSON.parse(
    await readFile(resolve(ROOT, `${IOS_ROOT}/AppIcon.appiconset/Contents.json`), 'utf8')
  );
  for (const item of IOS_CONTENTS.images) {
    if (!item.filename) continue;
    const size = Math.round(Number.parseFloat(item.size) * Number.parseFloat(item.scale));
    await png(`${IOS_ROOT}/AppIcon.appiconset/${item.filename}`, size, icon(0.84), true);
  }
  for (const scale of [1, 2, 3]) {
    await png(
      `${IOS_ROOT}/LaunchImage.imageset/LaunchImage${scale === 1 ? '' : `@${scale}x`}.png`,
      160 * scale,
      icon(0.9, null)
    );
  }

  const ANDROID_ROOT = `${app}/android/app/src/main/res`;
  for (const [density, size, factor] of [
    ['mdpi', 48, 1],
    ['hdpi', 72, 1.5],
    ['xhdpi', 96, 2],
    ['xxhdpi', 144, 3],
    ['xxxhdpi', 192, 4],
  ]) {
    await png(`${ANDROID_ROOT}/mipmap-${density}/ic_launcher.png`, size, icon(0.84));
    await png(
      `${ANDROID_ROOT}/drawable-${density}/openride_splash.png`,
      160 * factor,
      icon(0.9, null)
    );
    // Adaptive icons use a 108dp canvas; keep content inside its central safe region.
    await png(
      `${ANDROID_ROOT}/drawable-${density}/ic_launcher_foreground.png`,
      108 * factor,
      icon(0.58, null)
    );
  }
}

// Check export dimensions and that no output is an empty/transparent placeholder.
for (const [path, expected] of OUTPUTS) {
  const input = sharp(resolve(ROOT, path));
  const metadata = await input.metadata();
  const stats = await input.stats();
  if (path.includes('/ios/Runner/Assets.xcassets/AppIcon.appiconset/') && metadata.hasAlpha) {
    throw new Error(`iOS app icon contains an alpha channel: ${path}`);
  }
  if (
    metadata.width !== expected ||
    metadata.height !== expected ||
    stats.channels.every((channel) => channel.stdev === 0)
  ) {
    throw new Error(`Invalid branding export: ${path}`);
  }
}
globalThis.console.log(
  `Generated and checked ${OUTPUTS.size} PNG assets plus SVG copies from openride-design-system/assets/brand/logo.svg`
);
