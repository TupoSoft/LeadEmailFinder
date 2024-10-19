import { readFile } from 'fs/promises'

interface ProxyData {
    auth: {
        username: string
        password: string
    }
    host: string
    port: number
    protocol: string
}

export interface ProxyRepository {
    getByName: (name: string) => ProxyData | Promise<ProxyData>
}

export async function getProxiesFromFile(): Promise<Record<string, ProxyData>> {
    const { PROXY_FILE: proxyFile } = process.env

    if (proxyFile === undefined) {
        console.error('The PROXY_FILE variable is undefined.')
        process.exit(1)
    }

    return await readFile(proxyFile, 'utf-8').then(
        value => JSON.parse(value),
        reason => {
            console.error(reason)
        },
    )
}

export class ProxyRepositoryImpl implements ProxyRepository {
    constructor(private readonly data: Record<string, ProxyData>) {}

    getByName: (name: string) => ProxyData = (name: string): ProxyData => {
        return this.data[name]
    }
}
