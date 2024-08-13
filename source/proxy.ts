import {readFileSync} from "fs";

export interface ProxyData {
    host: string
    port: number
    user?: string
    password?: string
}

const filePath = 'source/config/proxies.json';

function loadProxiesFromFile(filePath: string): string[] {
    const data = readFileSync(filePath, 'ascii')
    return JSON.parse(data) as string[]
}

export class ProxyRotator {
    private readonly proxies: ProxyData[] = []

    constructor(proxies: string[] = []) {
        for (const proxy of proxies) {
            this.proxies.push(ProxyRotator.parseProxyUrl(proxy))
        }
    }

    private static parseProxyUrl(proxyUrl: string): ProxyData {
        const url = new URL(proxyUrl);

        return {
            host: url.hostname,
            port: parseInt(url.port),
            user: url.username,
            password: url.password
        };
    }

    getRandomProxy(): ProxyData {
        const randomIndex = Math.floor(Math.random() * this.proxies.length);
        return this.proxies[randomIndex];
    }
}

export default new ProxyRotator(loadProxiesFromFile(filePath))
