import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ApiConfig } from '../config.js';
import type {
  AttachmentRecord,
  ObjectHead,
  ObjectStorage,
  UploadDescriptor
} from '../domain/accounting.js';

function createClient(endpoint: string, config: ApiConfig): S3Client {
  return new S3Client({
    endpoint,
    region: config.OBJECT_STORAGE_REGION,
    forcePathStyle: config.OBJECT_STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY
    }
  });
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly internalClient: S3Client;
  private readonly publicSigningClient: S3Client;

  constructor(private readonly config: ApiConfig) {
    this.internalClient = createClient(config.OBJECT_STORAGE_ENDPOINT, config);
    this.publicSigningClient = createClient(
      config.OBJECT_STORAGE_PUBLIC_ENDPOINT,
      config
    );
  }

  async createUpload(record: AttachmentRecord): Promise<UploadDescriptor> {
    const expiresIn = this.config.OBJECT_STORAGE_UPLOAD_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1_000).toISOString();
    const command = new PutObjectCommand({
      Bucket: this.config.OBJECT_STORAGE_BUCKET,
      Key: record.objectKey,
      ContentType: record.mimeType,
      Metadata: {
        sha256: record.sha256,
        attachmentid: record.id,
        organizationid: record.organizationId,
        companyid: record.companyId
      }
    });

    return {
      method: 'PUT',
      url: await getSignedUrl(this.publicSigningClient, command, { expiresIn }),
      headers: {
        'content-type': record.mimeType,
        'x-amz-meta-sha256': record.sha256,
        'x-amz-meta-attachmentid': record.id,
        'x-amz-meta-organizationid': record.organizationId,
        'x-amz-meta-companyid': record.companyId
      },
      expiresAt
    };
  }

  async head(record: AttachmentRecord): Promise<ObjectHead> {
    const response = await this.internalClient.send(
      new HeadObjectCommand({
        Bucket: this.config.OBJECT_STORAGE_BUCKET,
        Key: record.objectKey
      })
    );

    return {
      byteSize: response.ContentLength ?? 0,
      contentType: response.ContentType ?? null,
      etag: response.ETag?.replaceAll('"', '') ?? null,
      sha256: response.Metadata?.sha256 ?? null
    };
  }
}
