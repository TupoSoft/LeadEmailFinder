import { createLogger, defineConfig, loadEnv } from 'vite'
import type { Plugin, ProxyOptions, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { isApiRequest, STATIC_SECURITY_HEADERS } from './gateway-routes.ts'
import { resolveCheckoutAllowedOrigins } from '../../src/libs/common/src/checkout-redirect.ts'

// Vite's style injection and React refresh need a nonce; this fixed value is for
// local development only and is never included in the built Nginx document.
const DEVELOPMENT_NONCE = 'lef-vite-development-only'

function staticHeaders(development: boolean): Plugin {
    const headers = {
        ...STATIC_SECURITY_HEADERS,
        ...(development
            ? {
                  'Content-Security-Policy': STATIC_SECURITY_HEADERS['Content-Security-Policy']
                      .replace("script-src 'self'", `script-src 'self' 'nonce-${DEVELOPMENT_NONCE}'`)
                      .replace("style-src 'self'", `style-src 'self' 'nonce-${DEVELOPMENT_NONCE}'`)
                      .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"),
              }
            : {}),
    }
    const configure = (server: Pick<ViteDevServer, 'middlewares'>) => {
        server.middlewares.use((request, response, next) => {
            if (!isApiRequest(request.url ?? '/')) {
                for (const [name, value] of Object.entries(headers)) response.setHeader(name, value)
            }
            next()
        })
    }
    return { name: 'static-security-headers', configureServer: configure, configurePreviewServer: configure }
}

export default defineConfig(({ command, isPreview, mode }) => {
    const development = command === 'serve' && !isPreview
    const environment = loadEnv(mode, process.cwd(), '')
    const target = environment.WEB_API_PROXY_TARGET || 'http://localhost:53000'
    const checkoutOrigins = resolveCheckoutAllowedOrigins({
        provider: environment.PAYMENTS_PROVIDER || 'stub',
        checkoutUrl: environment.PAYMENTS_CHECKOUT_URL || 'http://localhost:53000/billing/complete',
        allowedOrigins: environment.PAYMENTS_CHECKOUT_ALLOWED_ORIGINS,
    })
    const logger = createLogger()
    const originalError = logger.error.bind(logger)
    logger.error = (message, options) => {
        // Vite's default proxy error includes the raw URL and upstream error.
        originalError(message.includes('http proxy error') ? 'API proxy request failed' : message, options)
    }
    // Dispatch only the explicit API inventory. A predicate is necessary because
    // Nginx decodes paths before routing; the upstream still receives the original URL.
    const proxy = {
        '^/': {
            target,
            changeOrigin: false,
            xfwd: true,
            bypass(request) {
                return isApiRequest(request.url ?? '/') ? undefined : (request.url ?? '/')
            },
        },
    } satisfies Record<string, ProxyOptions>
    return {
        plugins: [react(), staticHeaders(development)],
        define: { __PAYMENTS_CHECKOUT_ALLOWED_ORIGINS__: JSON.stringify(checkoutOrigins) },
        customLogger: logger,
        html: development ? { cspNonce: DEVELOPMENT_NONCE } : undefined,
        server: { proxy },
        preview: { proxy },
        build: { target: 'es2022' },
    }
})
