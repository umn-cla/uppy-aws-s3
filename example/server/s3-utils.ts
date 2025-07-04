import {
  PutObjectCommand,
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  Part,
  ListPartsCommandOutput,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from './config'

const s3Client = new S3Client({
  region: config.aws.region,
  credentials: config.aws.credentials,
  // endpoint: config.aws.endpoint,
})

export const generateS3Key = (filename) => `test/${crypto.randomUUID()}-${filename}`

export async function uploadFile(file: File) {
  const key = generateS3Key(file.name)
  const command = new PutObjectCommand({
    Bucket: config.aws.bucket,
    Key: key,
    Body: file,
    ContentType: file.type,
  })

  return s3Client
    .send(command)
    .then(() => ({
      key,
      url: `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`,
      filename: file.name,
    }))
    .catch((error) => {
      console.error('Error uploading file:', error)
      throw new Error('File upload failed')
    })
}

export async function getMultipartUploadPresignedUrl({
  key,
  uploadId,
  partNumber,
}: {
  key: string
  uploadId: string
  partNumber: number
}) {
  const command = new UploadPartCommand({
    Bucket: config.aws.bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: '',
  })

  return getSignedUrl(s3Client, command, { expiresIn: 3600 })
    .then((url) => ({
      url,
      // key,
      method: 'PUT',
    }))
    .catch((error) => {
      console.error('Error creating presigned URL:', error)
      throw new Error('Presigned URL creation failed')
    })
}

export function getPresignedUploadUrl({
  filename,
  contentType,
}: {
  filename: string
  contentType: string
}) {
  const key = generateS3Key(filename)

  const command = new PutObjectCommand({
    Bucket: config.aws.bucket,
    Key: key,
    ContentType: contentType,
  })

  return getSignedUrl(s3Client, command, { expiresIn: 3600 })
    .then((url) => ({
      url,
      // key,
      method: 'PUT',
    }))
    .catch((error) => {
      console.error('Error creating presigned URL:', error)
      throw new Error('Presigned URL creation failed')
    })
}

export async function createMultipartUpload({
  filename,
  contentType,
  metadata,
}: {
  filename: string
  contentType: string
  metadata?: Record<string, string>
}) {
  const key = generateS3Key(filename)

  const command = new CreateMultipartUploadCommand({
    Bucket: config.aws.bucket,
    Key: key,
    ContentType: contentType,
    Metadata: metadata,
  })

  if (!s3Client) {
    throw new Error('S3 client is not initialized')
  }

  return s3Client
    .send(command)
    .then((data) => ({
      uploadId: data.UploadId,
      key: key,
    }))
    .catch((error) => {
      console.error('Error initializing multipart upload:', error)
      throw new Error('Multipart upload initialization failed')
    })
}

export async function uploadPart() {}

export async function completeMultipartUpload({
  uploadId,
  key,
  parts,
}: {
  uploadId: string
  key: string
  parts: Part[]
}) {
  // verify that parts have a part number and etag otherwise
  // aws will give an malformed XML error
  if (!parts.every((part) => part.PartNumber && part.ETag)) {
    throw new Error('All parts must have a PartNumber and ETag')
  }

  // Implementation for completing a multipart upload
  // This function should take the uploadId and parts to complete the upload
  const command = new CompleteMultipartUploadCommand({
    Bucket: config.aws.bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts,
    },
  })

  try {
    const res = await s3Client.send(command)
    return res.Location
  } catch (error) {
    console.error('Error completing multipart upload:', error)
    throw new Error('Multipart upload completion failed')
  }
}

export async function listUploadParts({ uploadId, key }: { uploadId: string; key: string }) {
  const parts = [] as Part[]
  let partNumberMarker: string | undefined = undefined
  let isTruncated = true

  // iterate through the parts until all are listed
  while (isTruncated) {
    const command = new ListPartsCommand({
      Bucket: config.aws.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumberMarker: partNumberMarker,
    })
    const response: ListPartsCommandOutput = await s3Client.send(command)
    parts.push(...(response.Parts || []))
    isTruncated = response.IsTruncated || false
    partNumberMarker = response.NextPartNumberMarker
  }

  return parts
}

export async function abortMultipartUpload({ uploadId, key }: { uploadId: string; key: string }) {
  const command = new AbortMultipartUploadCommand({
    Bucket: config.aws.bucket,
    Key: key,
    UploadId: uploadId,
  })

  return s3Client
    .send(command)
    .then(() => ({
      message: 'Multipart upload aborted successfully',
    }))
    .catch((error) => {
      console.error('Error aborting multipart upload:', error)
      throw new Error('Multipart upload abort failed')
    })
}
