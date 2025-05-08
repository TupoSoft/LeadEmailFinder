export const REDIS_DEFAULT_DB_INDEX = 0
export const REDIS_DEFAULT_PORT = 6379
export const REDIS_SENTINEL_DEFAULT_PORT = 26379
export const REDIS_SENTINEL_URL_REGEX =
    /^(?:(?<scheme>[\w+-]+):\/\/)?(?:(?:(?<username>[^:@]+):)?(?<password>[^@]+)@)?(?<hosts>[^/?#]+)(?:\/(?<database>\d+))?(?:\?(?<query>.*?))?$/
