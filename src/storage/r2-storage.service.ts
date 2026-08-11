import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly publicBaseUrl: string | null;
  private readonly accountId: string | null;

  constructor(private readonly config: ConfigService) {
    this.accountId = this.config.get<string>('R2_ACCOUNT_ID') || null;
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('R2_BUCKET_NAME') || null;
    this.publicBaseUrl = this.config.get<string>('R2_PUBLIC_BASE_URL') || null;

    if (this.accountId && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.client !== null && this.bucket !== null;
  }

  getBucketName(): string | null {
    return this.bucket;
  }

  async uploadObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME on the server.',
      );
    }

    try {
      await this.client!.send(
        new PutObjectCommand({
          Bucket: this.bucket!,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown R2 upload error';
      throw new InternalServerErrorException(
        `R2 upload failed: ${message}. Create a NEW token in Cloudflare → R2 → Manage R2 API Tokens with permission **Admin Read & Write** (not Object Read only) for bucket "${this.bucket}", then update R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY on Railway and redeploy.`,
      );
    }

    return key;
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!key) return '';

    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }

    if (!this.client || !this.bucket) {
      return `https://stub.r2.local/${encodeURIComponent(key)}`;
    }

    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(key.endsWith('.mp4')
          ? { ResponseContentType: 'video/mp4' }
          : key.endsWith('.webm')
            ? { ResponseContentType: 'video/webm' }
            : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}
