import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

@Injectable()
export class FileStorageService {
  private readonly driver: 'local' | 's3';
  private readonly localDirectory: string;
  private readonly bucket?: string;
  private readonly client?: S3Client;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.getOrThrow<'local' | 's3'>('FILE_STORAGE_DRIVER');
    this.localDirectory = resolve(
      process.cwd(),
      this.config.getOrThrow<string>('FILE_LOCAL_DIRECTORY'),
    );
    if (this.driver === 's3') {
      this.bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');
      const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
      const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
      this.client = new S3Client({
        region: this.config.getOrThrow<string>('AWS_REGION'),
        // On AWS, omitting credentials uses the task/instance IAM role. Local
        // development can supply a restricted IAM user's access keys instead.
        ...(accessKeyId && secretAccessKey
          ? { credentials: { accessKeyId, secretAccessKey } }
          : {}),
      });
    }
  }

  async upload(key: string, buffer: Buffer, contentType: string) {
    if (this.driver === 'local') {
      const path = join(this.localDirectory, key);
      await mkdir(resolve(path, '..'), { recursive: true });
      await writeFile(path, buffer);
      return;
    }
    await this.client!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async remove(key: string) {
    if (this.driver === 'local') {
      await rm(join(this.localDirectory, key), { force: true });
      return;
    }
    await this.client!.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getDownloadUrl(key: string) {
    if (this.driver === 'local') return null;
    return getSignedUrl(
      this.client!,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      {
        expiresIn: this.config.getOrThrow<number>(
          'FILE_SIGNED_URL_TTL_SECONDS',
        ),
      },
    );
  }

  getLocalPath(key: string) {
    return join(this.localDirectory, key);
  }

  isLocal() {
    return this.driver === 'local';
  }
}
