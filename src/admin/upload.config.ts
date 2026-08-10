export const UPLOAD_LIMITS = {
  photo: { fileSize: 10 * 1024 * 1024 },
  thumbnail: { fileSize: 10 * 1024 * 1024 },
  video: { fileSize: 500 * 1024 * 1024 },
} as const;
