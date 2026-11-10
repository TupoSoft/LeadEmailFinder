import { ok } from 'node:assert'

export function parseS3ResultLocation(value: string): { bucket: string; key: string } {
    let url: URL | undefined

    try {
        url = new URL(value)
    } catch {
        url = undefined
    }

    ok(url !== undefined && url.protocol === 's3:', `Malformed S3 result location: "${value}".`)

    const bucket = url.hostname
    ok(bucket.length > 0, `Malformed S3 result location: "${value}".`)

    // `url.pathname` always begins with '/' when a URL has an authority (host) component; that slash is
    // structural URL syntax, not part of the S3 key. `deriveResultsKey()` never produces a key that starts
    // with '/', so stripping exactly one leading slash recovers the original key unchanged.
    const rawKey = url.pathname.replace(/^\//, '')

    let key: string
    try {
        key = decodeURIComponent(rawKey)
    } catch {
        key = ''
    }

    ok(key.length > 0, `Malformed S3 result location: "${value}".`)

    return { bucket, key }
}
