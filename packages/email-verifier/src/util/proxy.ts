import { readFileSync } from 'fs'
import path from 'node:path'

export interface ProxyData {
    host: string
    port: number
    user?: string
    password?: string
}

const filePath = path.join(__dirname, '../config/proxies.json')

function loadProxiesFromFile(filePath: string): string[] {
    const data = readFileSync(filePath, 'ascii')
    return JSON.parse(data) as string[]
}

export function generateAuthTokenFromCredentials(user: string, password: string): string {
    return Buffer.from(`${user}:${password}`).toString('base64')
}

export class ProxyRotator {
    private readonly proxies: ProxyData[] = []

    constructor(proxies: string[] = []) {
        for (const proxy of proxies) {
            this.proxies.push(ProxyRotator.parseProxyUrl(proxy))
        }
    }

    private static parseProxyUrl(proxyUrl: string): ProxyData {
        const url = new URL(proxyUrl)

        return {
            host: url.hostname,
            port: parseInt(url.port),
            user: url.username,
            password: url.password,
        }
    }

    getRandomProxy(): ProxyData {
        const randomIndex = Math.floor(Math.random() * this.proxies.length)
        return this.proxies[randomIndex]
    }
}

export default new ProxyRotator(loadProxiesFromFile(filePath))
