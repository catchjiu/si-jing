import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

let client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export function getR2Bucket(): string {
  return requireEnv("R2_BUCKET");
}

export async function presignPut(opts: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: opts.key,
    ContentType: opts.contentType,
  });
  return getSignedUrl(getR2Client(), command, {
    expiresIn: opts.expiresIn ?? 600,
  });
}

export async function presignGet(opts: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: opts.key,
  });
  return getSignedUrl(getR2Client(), command, {
    expiresIn: opts.expiresIn ?? 3600,
  });
}

export async function putR2Object(opts: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
    })
  );
}

export async function r2ObjectExists(key: string): Promise<boolean> {
  try {
    await getR2Client().send(
      new HeadObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function getR2ObjectBytes(key: string): Promise<{
  body: Buffer;
  contentType: string | undefined;
}> {
  const res = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    })
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("Empty R2 object");
  return {
    body: Buffer.from(bytes),
    contentType: res.ContentType,
  };
}

export async function removeR2Object(key: string): Promise<void> {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    })
  );
}
