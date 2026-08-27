import { startSmtpPeerProbe } from './smtp-peer-probe'

async function main(): Promise<void> {
    const options = {
        smtpHost: process.env.SMTP_PEER_PROBE_HOST ?? '0.0.0.0',
        smtpPort: Number(process.env.SMTP_PEER_PROBE_SMTP_PORT ?? 2525),
        statusHost: process.env.SMTP_PEER_PROBE_STATUS_HOST ?? '0.0.0.0',
        statusPort: Number(process.env.SMTP_PEER_PROBE_STATUS_PORT ?? 9000),
    }

    const handle = await startSmtpPeerProbe(options)
    console.log(
        `smtp-peer-probe listening: smtp ${options.smtpHost}:${handle.smtpPort}, status ${options.statusHost}:${handle.statusPort}`,
    )

    const shutdown = (): void => {
        void handle.close().finally(() => process.exit(0))
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
}

void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
