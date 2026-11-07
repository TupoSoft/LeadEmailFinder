import type { betterAuth } from 'better-auth'
import type { magicLink } from 'better-auth/plugins/magic-link'
import type { twoFactor } from 'better-auth/plugins/two-factor'

/** The installed ESM entry points this runtime composes; tests may supply substitutes. */
export interface BetterAuthLibrary {
    readonly betterAuth: typeof betterAuth
    readonly magicLink: typeof magicLink
    readonly twoFactor: typeof twoFactor
}

/**
 * Loads the ESM-only package from the CommonJS application. SWC emits these as `require()` calls, which
 * Node 22.12+ resolves through `require(esm)`; `test:auth-runtime` proves it with a compiled Node process.
 */
export async function loadBetterAuthLibrary(): Promise<BetterAuthLibrary> {
    const [core, magicLinkPlugin, twoFactorPlugin] = await Promise.all([
        import('better-auth'),
        import('better-auth/plugins/magic-link'),
        import('better-auth/plugins/two-factor'),
    ])

    return {
        betterAuth: core.betterAuth,
        magicLink: magicLinkPlugin.magicLink,
        twoFactor: twoFactorPlugin.twoFactor,
    }
}
