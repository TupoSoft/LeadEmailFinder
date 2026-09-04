import { BadRequestException } from '@nestjs/common'
import { isUUID } from 'class-validator'

export function parseCreditIdempotencyKey(rawHeaders: readonly string[]): string {
    const values: string[] = []
    for (let index = 0; index < rawHeaders.length; index += 2) {
        if (rawHeaders[index].toLowerCase() === 'idempotency-key') {
            values.push(rawHeaders[index + 1])
        }
    }

    const key = values[0]
    if (values.length !== 1 || !isUUID(key) || key !== key.toLowerCase()) {
        throw new BadRequestException(
            'Exactly one Idempotency-Key header containing a canonical lowercase UUID is required',
        )
    }
    return key
}
