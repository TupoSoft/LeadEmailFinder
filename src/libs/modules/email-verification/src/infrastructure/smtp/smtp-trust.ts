import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { getCACertificates } from 'node:tls'

export function loadSmtpTlsCa(caFile: string | undefined): string[] | undefined {
    if (caFile === undefined) {
        return undefined
    }

    const customCaPem = readFileSync(caFile, 'utf8')
    new X509Certificate(customCaPem)

    return [...getCACertificates('default'), customCaPem]
}
