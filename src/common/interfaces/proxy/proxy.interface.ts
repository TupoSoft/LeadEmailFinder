export interface IProxy {
    id: string

    type: 'http' | 'https' | 'socks4' | 'socks5'

    host: string

    port: number

    user?: string

    password?: string

    blacklists?: string[]
}
