import { IFile } from '@nestjs/common/pipes/file/interfaces'

export interface BatchEmailVerificationFile extends IFile {
    bucket: string
    key: string
    acl: string
    contentType: string
    contentDisposition: null
    storageClass: string
    serverSideEncryption: null
    metadata: any
    location: string
    etag: string
}
