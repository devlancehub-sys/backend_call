import { BadRequestException } from '@nestjs/common';

const MIME_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionForMime(mime: string, fallback = 'bin'): string {
  return MIME_EXTENSIONS[mime.toLowerCase()] ?? fallback;
}

export interface UploadFileRules {
  label: string;
  maxBytes: number;
  allowedMimes: string[];
}

export function assertUploadFile(
  file: Express.Multer.File | undefined,
  rules: UploadFileRules,
): Express.Multer.File {
  if (!file) {
    throw new BadRequestException(
      `No ${rules.label} file provided. Send multipart/form-data with field name "file".`,
    );
  }

  if (!file.buffer?.length) {
    throw new BadRequestException('Uploaded file is empty');
  }

  if (file.size > rules.maxBytes) {
    const maxMb = Math.round(rules.maxBytes / (1024 * 1024));
    throw new BadRequestException(`File too large. Maximum size is ${maxMb}MB`);
  }

  const mime = (file.mimetype || '').toLowerCase();
  if (!rules.allowedMimes.includes(mime)) {
    throw new BadRequestException(
      `Invalid ${rules.label} type "${file.mimetype}". Allowed: ${rules.allowedMimes.join(', ')}`,
    );
  }

  return file;
}

export const PHOTO_UPLOAD_RULES: UploadFileRules = {
  label: 'photo',
  maxBytes: 10 * 1024 * 1024,
  allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
};

export const THUMBNAIL_UPLOAD_RULES: UploadFileRules = {
  label: 'thumbnail',
  maxBytes: 10 * 1024 * 1024,
  allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
};

export const VIDEO_UPLOAD_RULES: UploadFileRules = {
  label: 'video',
  maxBytes: 500 * 1024 * 1024,
  allowedMimes: ['video/mp4', 'video/webm', 'video/quicktime'],
};
