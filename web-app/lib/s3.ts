import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

export const bucketName = process.env.S3_BUCKET_NAME

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
    : undefined,
})

export async function getRecordingObject(key: string, range?: string | null) {
  if (!bucketName) throw new Error('S3_BUCKET_NAME is not configured')
  return s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key, ...(range ? { Range: range } : {}) }))
}
