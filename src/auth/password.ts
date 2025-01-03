import { promisify } from 'node:util'
import { BinaryLike, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { isEmptyString } from '../util/string'
import { ok } from 'node:assert'

const randomBytesAsync = promisify(randomBytes)
const scryptAsync = promisify<BinaryLike, BinaryLike, number, Buffer>(scrypt)
const keyLength = 64

export async function hash(password: string): Promise<string> {
    ok(!isEmptyString(password), 'Password must be a non-empty string')

    const saltBuffer = await randomBytesAsync(16)
    const hashBuffer = await scryptAsync(password, saltBuffer, keyLength)
    return `${saltBuffer.toString('hex')}:${hashBuffer.toString('hex')}`
}

export async function compare(password: string, saltedHash: string): Promise<boolean> {
    ok(!isEmptyString(password), 'Password must be a non-empty string')
    ok(!isEmptyString(saltedHash), 'Salted hash must be a non-empty string')

    const [salt, storedHash] = saltedHash.split(':')
    if (salt === undefined || storedHash === undefined) {
        throw new Error('Invalid salted hash format')
    }

    const saltBuffer = Buffer.from(salt, 'hex')
    const storedHashBuffer = Buffer.from(storedHash, 'hex')
    const hashBuffer = await scryptAsync(password, saltBuffer, keyLength)

    return timingSafeEqual(storedHashBuffer, hashBuffer)
}
