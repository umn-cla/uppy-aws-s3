import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import * as S3 from './s3-utils'

const app = new Hono()

app.use('*', cors())
app.get('/', (c) => c.text('Hono!'))
app.get('/hello', (c) => c.text('Hello World!'))

app.post('/s3/upload', async (c) => {
  const body = await c.req.parseBody()
  const file = body.file

  if (!file) {
    return c.json(
      {
        message: 'No file uploaded',
      },
      400,
    )
  }

  if (typeof file !== 'object' || !file.name || !file.type) {
    return c.json(
      {
        message: 'Invalid file format',
      },
      400,
    )
  }

  return S3.uploadFile(file)
    .then(({ url }) => {
      c.json({
        message: 'File uploaded successfully',
        url,
      })
    })
    .catch((error) => {
      console.error('Error uploading file:', error)
      return c.json(
        {
          message: 'Error uploading file',
        },
        500,
      )
    })
})

app.post('/s3/sign', async (c) => {
  const body = await c.req.json()
  console.log('Received body:', body)

  const { filename, contentType } = body

  if (!filename || !contentType) {
    return c.json(
      {
        message: 'Filename and content type are required',
      },
      400,
    )
  }

  if (typeof filename !== 'string' || typeof contentType !== 'string') {
    return c.json(
      {
        message: 'Invalid filename or content type format',
      },
      400,
    )
  }

  return S3.getPresignedUploadUrl({ filename, contentType })
    .then((data) => c.json(data))
    .catch((error) => {
      console.error('Error creating presigned URL:', error)
      return c.json(
        {
          message: 'Error creating presigned URL',
        },
        500,
      )
    })
})

// start a multipart upload
app.post('/s3/multipart', async (c) => {
  const { type, metadata, filename } = await c.req.json()

  if (typeof type !== 'string') {
    return c.json(
      {
        message: 'Invalid type format',
      },
      400,
    )
  }

  if (typeof filename !== 'string') {
    return c.json(
      {
        message: 'Invalid filename format',
      },
      400,
    )
  }

  // if metadata is provided, it should be an object
  if (!!metadata && typeof metadata !== 'object') {
    return c.json(
      {
        message: 'Invalid metadata format',
      },
      400,
    )
  }

  try {
    const { key, uploadId } = await S3.createMultipartUpload({
      filename,
      contentType: type,
      metadata,
    })
    return c.json({
      message: 'Multipart upload started successfully',
      uploadId,
      key,
    })
  } catch (error) {
    console.error('Error starting multipart upload:', error)
    return c.json(
      {
        message: 'Error starting multipart upload',
      },
      500,
    )
  }
})

app.get('/s3/multipart/:uploadId/:partNumber', async (c) => {
  const { uploadId, partNumber } = c.req.param()
  const { key } = c.req.query()

  if (typeof uploadId !== 'string' || typeof partNumber !== 'string') {
    return c.json(
      {
        message:
          's3: invalid uploadId or partNumber. Must be part of url params: "/s3/multipart/<uploadId>/<partNumber>"',
      },
      400,
    )
  }

  if (typeof key !== 'string') {
    return c.json(
      {
        message:
          's3: the object key must be passed as a query parameter. For example: "?key=abc.jpg"',
      },
      400,
    )
  }

  // check that part number is between 1 and 10000
  const partNumInt = parseInt(partNumber, 10)
  if (partNumInt < 1 || partNumInt > 10_000) {
    return c.json(
      {
        message: 's3: the part number must be an integer between 1 and 10000.',
      },
      400,
    )
  }

  try {
    const { url, method } = await S3.getMultipartUploadPresignedUrl({
      key,
      uploadId,
      partNumber: partNumInt,
    })
    return c.json({
      message: 'Multipart upload part presigned URL created successfully',
      url,
      method,
    })
  } catch (error) {
    console.error('Error creating multipart upload part presigned URL:', error)
    return c.json(
      {
        message: 'Error creating multipart upload part presigned URL',
      },
      500,
    )
  }
})

app.get('/s3/multipart/:uploadId', async (c) => {
  const { uploadId } = c.req.param()
  const { key } = c.req.query()

  if (typeof uploadId !== 'string') {
    return c.json(
      {
        message: 's3: invalid uploadId. Must be part of url params: "/s3/multipart/<uploadId>"',
      },
      400,
    )
  }

  if (typeof key !== 'string') {
    return c.json(
      {
        message:
          's3: the object key must be passed as a query parameter. For example: "?key=abc.jpg"',
      },
      400,
    )
  }

  try {
    const parts = await S3.listUploadParts({ uploadId, key })
    return c.json(parts)
  } catch (error) {
    console.error('Error completing multipart upload:', error)
    return c.json(
      {
        message: 'Error completing multipart upload',
      },
      500,
    )
  }
})

app.post('/s3/multipart/:uploadId/complete', async (c) => {
  const { uploadId } = c.req.param()
  const { key } = c.req.query()
  const body = await c.req.json()

  if (typeof uploadId !== 'string') {
    return c.json(
      {
        message: 's3: invalid uploadId. Must be part of url params: "/s3/multipart/<uploadId>"',
      },
      400,
    )
  }

  if (typeof key !== 'string') {
    return c.json(
      {
        message:
          's3: the object key must be passed as a query parameter. For example: "?key=abc.jpg"',
      },
      400,
    )
  }

  if (!Array.isArray(body.parts) || body.parts.length === 0) {
    return c.json(
      {
        message: 's3: parts must be an array of part numbers to complete the multipart upload.',
      },
      400,
    )
  }

  // get a list of parts from s3
  // AWS recommends keeping track of parts and eTags on the client side,
  // but to do this, we need to change CORS on the S3 bucket to expose the ETag
  // header. And, we don't want to make that setting change for reasons.
  // THUS: we'll fetch the parts from S3 to complete the multipart upload.
  const s3Parts = await S3.listUploadParts({ uploadId, key })

  console.log('Parts to complete:', s3Parts)

  // TODO: check s3Parts match the body.parts
  const allPartsMatch = s3Parts.every((s3part, index) => {
    return s3part.PartNumber === body.parts[index].PartNumber
  })

  if (!allPartsMatch) {
    return c.json(
      {
        message: 's3: parts do not match the parts in the multipart upload.',
        s3Parts,
        clientParts: body.parts,
      },
      400,
    )
  }

  try {
    const location = await S3.completeMultipartUpload({ uploadId, key, parts: s3Parts })
    return c.json({
      message: 'Multipart upload completed successfully',
      location,
    })
  } catch (error) {
    console.error('Error completing multipart upload:', error)
    return c.json(
      {
        message: 'Error completing multipart upload',
      },
      500,
    )
  }
})

app.delete('/s3/multipart/:uploadId', async (c) => {
  const { uploadId } = c.req.param()
  const { key } = c.req.query()

  if (typeof uploadId !== 'string') {
    return c.json(
      {
        message: 's3: invalid uploadId. Must be part of url params: "/s3/multipart/<uploadId>"',
      },
      400,
    )
  }

  if (typeof key !== 'string') {
    return c.json(
      {
        message:
          's3: the object key must be passed as a query parameter. For example: "?key=abc.jpg"',
      },
      400,
    )
  }

  try {
    await S3.abortMultipartUpload({ uploadId, key })
    return c.json({
      message: 'Multipart upload aborted successfully',
    })
  } catch (error) {
    console.error('Error aborting multipart upload:', error)
    return c.json(
      {
        message: 'Error aborting multipart upload',
      },
      500,
    )
  }
})

const server = serve(app, (info) => {
  console.log(`Listening on http://localhost:${info.port}`) // Listening on http://localhost:3000
})

// graceful shutdown
process.on('SIGINT', () => {
  server.close()
  process.exit(0)
})
process.on('SIGTERM', () => {
  server.close((err) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    process.exit(0)
  })
})
