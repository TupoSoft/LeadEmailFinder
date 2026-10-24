import type { Page } from '@playwright/test'

/** Exercise explicit exports in memory without writing credentials to the OS clipboard or download directory. */
export async function installServiceClientExportSink(page: Page) {
    await page.addInitScript(() => {
        const state = {
            copied: false,
            downloaded: false,
            filenameSafe: false,
            revoked: 0,
            copyFails: false,
            downloadFails: false,
        }
        Object.assign(window, { serviceClientExportEvidence: state })
        const currentSecret = () => document.querySelector<HTMLInputElement>('dialog input[readonly]')?.value ?? ''
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: (text: string) => {
                    if (state.copyFails) return Promise.reject(new Error('Clipboard unavailable'))
                    state.copied = text.length > 0 && text === currentSecret()
                    return Promise.resolve()
                },
            },
        })
        const create = URL.createObjectURL.bind(URL)
        const revoke = URL.revokeObjectURL.bind(URL)
        URL.createObjectURL = blob => {
            if (state.downloadFails) throw new Error('Download unavailable')
            if (blob instanceof Blob) {
                const secret = currentSecret()
                void blob.text().then(text => {
                    const payload: unknown = JSON.parse(text)
                    state.downloaded =
                        secret.length > 0 &&
                        typeof payload === 'object' &&
                        payload !== null &&
                        Object.keys(payload).length === 1 &&
                        Object.hasOwn(payload, 'apiKey') &&
                        Reflect.get(payload, 'apiKey') === secret
                })
            }
            return create(blob)
        }
        URL.revokeObjectURL = url => {
            state.revoked++
            revoke(url)
        }
        // The original DOM method is invoked below with its anchor receiver.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const click = HTMLAnchorElement.prototype.click
        HTMLAnchorElement.prototype.click = function () {
            if (this.download) {
                const secret = currentSecret()
                state.filenameSafe =
                    secret.length > 0 && this.download === 'api-key.json' && !this.href.includes(secret)
                return
            }
            click.call(this)
        }
    })
}

export async function serviceClientExportEvidence(page: Page) {
    return page.evaluate(
        () =>
            (
                window as unknown as {
                    serviceClientExportEvidence: {
                        copied: boolean
                        downloaded: boolean
                        filenameSafe: boolean
                        revoked: number
                    }
                }
            ).serviceClientExportEvidence,
    )
}

export async function setExportFailures(page: Page, copyFails: boolean, downloadFails: boolean) {
    await page.evaluate(
        ({ copyFails, downloadFails }) => {
            Object.assign((window as unknown as { serviceClientExportEvidence: object }).serviceClientExportEvidence, {
                copyFails,
                downloadFails,
            })
        },
        { copyFails, downloadFails },
    )
}
