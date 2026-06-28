/** Preset girl avatar filenames — bundled in apps, not uploaded to server. */
export const GIRL_AVATAR_PRESETS = [
  '00.jpeg',
  '1.jpeg',
  '2.jpeg',
  '3.jpeg',
  '4.jpeg',
  '5.jpeg',
  '6.jpeg',
  '7.jpeg',
  '8.jpeg',
  '12.jpeg',
  '13.jpeg',
] as const;

const LEGACY_PREFIX = 'girls_avatar:';

/** Old bundled SVG filenames mapped to new JPEG presets. */
const LEGACY_SVG_TO_JPEG: Record<string, string> = {
  'avatar_02.svg': '1.jpeg',
  'avatar_03.svg': '2.jpeg',
  'avatar_04.svg': '3.jpeg',
  'avatar_05.svg': '4.jpeg',
  'avatar_06.svg': '5.jpeg',
  'avatar_07.svg': '6.jpeg',
  'avatar_08.svg': '7.jpeg',
  'avatar_09.svg': '8.jpeg',
  'avatar_10.svg': '12.jpeg',
  'avatar_11.svg': '13.jpeg',
  'avatar_12.svg': '00.jpeg',
};

function extractAvatarFileName(value: string): string {
  let file = value.trim();
  if (!file) return file;

  if (file.startsWith(LEGACY_PREFIX)) {
    file = file.slice(LEGACY_PREFIX.length);
  }

  try {
    if (file.startsWith('http://') || file.startsWith('https://')) {
      file = new URL(file).pathname.split('/').pop() ?? file;
    }
  } catch {
    // Keep original when URL parsing fails.
  }

  if (file.includes('/')) {
    file = file.split('/').pop() ?? file;
  }
  if (file.includes('\\')) {
    file = file.split('\\').pop() ?? file;
  }

  return file.trim();
}

/** Store only the filename (e.g. 3.jpeg). Strips legacy prefix if present. */
export function normalizeGirlAvatarUrl(value?: string | null): string | null {
  if (value == null) return null;

  const file = extractAvatarFileName(String(value));
  if (!file) return null;

  if ((GIRL_AVATAR_PRESETS as readonly string[]).includes(file)) {
    return file;
  }

  const migrated = LEGACY_SVG_TO_JPEG[file];
  if (migrated) return migrated;

  return null;
}

export function defaultGirlAvatarUrl(): string {
  return GIRL_AVATAR_PRESETS[0];
}
