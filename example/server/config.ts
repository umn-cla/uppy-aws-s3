// import process from 'node:process'

export const config = {
  aws: {
    region: String(process.env.AWS_REGION),
    credentials: {
      accessKeyId: String(process.env.AWS_KEY),
      secretAccessKey: String(process.env.AWS_SECRET),
    },
    bucket: String(process.env.AWS_BUCKET),
  },
}

console.log(config)
