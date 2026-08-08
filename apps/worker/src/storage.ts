import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { WorkerConfig } from './config.js';

export class WorkerObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: WorkerConfig) {
    this.client = new S3Client({
      endpoint: config.OBJECT_STORAGE_ENDPOINT,
      region: config.OBJECT_STORAGE_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY
      }
    });
  }

  async read(objectKey: string, maximumBytes: number): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.OBJECT_STORAGE_BUCKET,
        Key: objectKey
      })
    );
    if (!response.Body) {
      throw new Error('Object storage returned an empty body');
    }
    const bytes = await response.Body.transformToByteArray();
    if (bytes.byteLength > maximumBytes) {
      throw new Error(`Object exceeds processing limit of ${maximumBytes} bytes`);
    }
    return Buffer.from(bytes);
  }
}
