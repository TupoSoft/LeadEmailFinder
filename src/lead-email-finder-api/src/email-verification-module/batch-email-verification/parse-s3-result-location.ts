export interface S3ResultLocation {
    bucket: string
    key: string
}

export function parseS3ResultLocation(value: string): S3ResultLocation {
    let location: URL

    try {
        location = new URL(value)
    } catch {
        throw new Error(`Invalid S3 result location: ${value}`)
    }

    if (location.protocol !== 's3:' || location.hostname.length === 0 || location.search || location.hash) {
        throw new Error(`Invalid S3 result location: ${value}`)
    }

    let key: string

    try {
        key = decodeURIComponent(location.pathname.slice(1))
    } catch {
        throw new Error(`Invalid S3 result location: ${value}`)
    }

    if (key.length === 0) {
        throw new Error(`Invalid S3 result location: ${value}`)
    }

    return {
        bucket: location.hostname,
        key,
    }
}
