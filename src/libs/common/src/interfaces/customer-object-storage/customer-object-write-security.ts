export type CustomerObjectWriteSecurity =
    | Readonly<{
          mode: 'production-kms'
          requireAuthenticatedHttps: true
          serverSideEncryption: 'aws:kms'
          kmsKeyId: string
          cacheControl: 'no-store'
      }>
    | Readonly<{
          mode: 'development-local'
          cacheControl: 'no-store'
      }>
