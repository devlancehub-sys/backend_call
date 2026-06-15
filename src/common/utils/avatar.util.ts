/** Preset girl avatar filenames — bundled in apps, not uploaded to server. */
export const GIRL_AVATAR_PRESETS = [
  'avatar_02.svg',
  'avatar_03.svg',
  'avatar_04.svg',
  'avatar_05.svg',
  'avatar_06.svg',
  'avatar_07.svg',
  'avatar_08.svg',
  'avatar_09.svg',
  'avatar_10.svg',
  'avatar_11.svg',
  'avatar_12.svg',
] as const;

const LEGACY_PREFIX = 'girls_avatar:';

/** Store only the filename (e.g. avatar_05.svg). Strips legacy prefix if present. */
export function normalizeGirlAvatarUrl(value?: string | null): string | null {
  if (value == null) return null;

  let file = String(value).trim();
  if (!file) return null;

  if (file.startsWith(LEGACY_PREFIX)) {
    file = file.slice(LEGACY_PREFIX.length);
  }

  return (GIRL_AVATAR_PRESETS as readonly string[]).includes(file) ? file : null;
}

export function defaultGirlAvatarUrl(): string {
  return GIRL_AVATAR_PRESETS[0];
}
