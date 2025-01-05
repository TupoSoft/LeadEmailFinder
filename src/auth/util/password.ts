import { promisify } from 'node:util'
import { type BinaryLike, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { isEmptyString } from '../../util/string'
import { ok } from 'node:assert'
import { KEYLEN, SALT_LENGTH } from '../constants'

const randomBytesAsync = promisify(randomBytes)
const scryptAsync = promisify<BinaryLike, BinaryLike, number, Buffer>(scrypt)

export async function hash(password: string): Promise<string> {
    ok(!isEmptyString(password), 'Password must be a non-empty string')

    const saltBuffer = await randomBytesAsync(SALT_LENGTH)
    const hashBuffer = await scryptAsync(password, saltBuffer, KEYLEN)
    return `${saltBuffer.toString('hex')}:${hashBuffer.toString('hex')}`
}

export async function compare(password: string, saltedHash: string): Promise<boolean> {
    ok(!isEmptyString(password), 'Password must be a non-empty string')
    ok(!isEmptyString(saltedHash), 'Salted hash must be a non-empty string')

    const saltedHashParts = saltedHash.split(':')

    const expectedLength = 2
    ok(saltedHashParts.length === expectedLength, 'Invalid salted hash format')

    const [salt, storedHash] = saltedHashParts

    const saltBuffer = Buffer.from(salt, 'hex')
    const storedHashBuffer = Buffer.from(storedHash, 'hex')
    const hashBuffer = await scryptAsync(password, saltBuffer, KEYLEN)

    return timingSafeEqual(storedHashBuffer, hashBuffer)
}
