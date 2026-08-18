import { Inject, Injectable, Logger } from '@nestjs/common'
import { EncryptJWT, jwtDecrypt, JWTPayload } from 'jose'
import { SessionRecord } from '../../domain/session-record'
import { decodeSessionEncryptionKey } from './session-encryption-key'

export const SESSION_ENCRYPTION_KEY = Symbol('SESSION_ENCRYPTION_KEY')

@Injectable()
export class SessionEncryptor {
    private readonly logger = new Logger(SessionEncryptor.name)
    private readonly key: Uint8Array

    constructor(@Inject(SESSION_ENCRYPTION_KEY) rawKey: string) {
        this.key = decodeSessionEncryptionKey(rawKey)
    }

    async encrypt(record: SessionRecord): Promise<string> {
        return new EncryptJWT(record as unknown as JWTPayload)
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .setIssuedAt()
            .encrypt(this.key)
    }

    async decrypt(ciphertext: string): Promise<SessionRecord | undefined> {
        try {
            const { payload } = await jwtDecrypt(ciphertext, this.key)
            return payload as unknown as SessionRecord
        } catch (error) {
            this.logger.debug(`Failed to decrypt a session record: ${String(error)}`)
            return undefined
        }
    }
}
