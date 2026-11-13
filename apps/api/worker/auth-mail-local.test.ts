import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { glob, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { getPlatformProxy, type PlatformProxy } from 'wrangler'
import { createMagicLinkMessage } from '../src/libs/better-auth/src/mail/magic-link-message'
import { createAuthMailDelivery } from './auth-mail'

void it('captures authentication mail through the native local email simulator', { timeout: 20_000 }, async () => {
    let platform: PlatformProxy<Pick<Env, 'AUTH_EMAIL' | 'AUTH_MAIL_FROM'>> | undefined

    try {
        platform = await getPlatformProxy<Pick<Env, 'AUTH_EMAIL' | 'AUTH_MAIL_FROM'>>({
            configPath: resolve(__dirname, '../wrangler.jsonc'),
            persist: false,
            remoteBindings: false,
            envFiles: [],
        })

        const message = createMagicLinkMessage(
            'recipient@example.test',
            `http://localhost:53000/v1/auth/magic-link/verify?token=synthetic-${randomUUID()}`,
        )
        const delivery = createAuthMailDelivery(platform.env)

        await delivery.send(message)

        const captureRoot = resolve(__dirname, '../.wrangler/tmp/email')

        // Native capture files are written asynchronously after the binding accepts the message.
        for (let attempt = 0; attempt < 100; attempt++) {
            for await (const path of glob('**/email-text/*.txt', { cwd: captureRoot })) {
                const capturedText = await readFile(resolve(captureRoot, path), 'utf8')

                if (capturedText === message.text) {
                    return
                }
            }

            await setTimeout(50)
        }

        assert.fail('The native email simulator did not write the authentication message to its capture file.')
    } finally {
        await platform?.dispose()
    }
})
