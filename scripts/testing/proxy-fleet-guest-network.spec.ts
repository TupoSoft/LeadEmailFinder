import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const script = readFileSync(resolve(__dirname, '../../deploy/proxy-fleet/vagrant/provision/guest-network.sh'), 'utf8')
const entrypoint = script.indexOf('\nMODE=${1-}\n')
if (entrypoint < 0) {
    throw new Error('Cannot safely isolate guest-network.sh function definitions')
}
const definitions = script.slice(0, entrypoint)
const correctRoute = '198.18.0.21 via 192.168.250.12 dev eth1 proto 98 \n'
const replacement = '-4 route replace 198.18.0.21/32 via 192.168.250.12 dev eth1 proto 98'

function applyRoutes(
    currentRoutes: string,
    exactRoute: string,
    exactReadStatus = 0,
): { status: number | null; mutations: string[] } {
    const result = spawnSync('sh', ['-s'], {
        encoding: 'utf8',
        timeout: 5000,
        env: {
            ...process.env,
            CURRENT_ROUTES: currentRoutes,
            EXACT_ROUTE: exactRoute,
            EXACT_READ_STATUS: String(exactReadStatus),
        },
        input: `
ip() {
    case "$*" in
        '-N -o -4 route show table main proto 98') printf '%s' "$CURRENT_ROUTES" ;;
        '-N -o -4 route show table main exact 198.18.0.21/32')
            if [ "$EXACT_READ_STATUS" -ne 0 ]; then return "$EXACT_READ_STATUS"; fi
            printf '%s' "$EXACT_ROUTE"
            ;;
        '-4 route del '* | '-4 route replace '*) printf '%s\\n' "$*" ;;
        *) printf 'Unexpected ip invocation: %s\\n' "$*" >&2; exit 64 ;;
    esac
}
${definitions}
UNDERLAY_INTERFACE=eth1
RETURN_DESTINATIONS=198.18.0.21/32
RETURN_ROUTES='198.18.0.21/32 192.168.250.12'
apply_routes
`,
    })

    expect(result.error).toBeUndefined()
    expect(result.stderr).toBe('')
    return { status: result.status, mutations: result.stdout.trim().split('\n').filter(Boolean) }
}

describe('guest return-route reconciliation', (): void => {
    it.each([
        {
            name: 'leaves a correct route with trailing output whitespace unchanged',
            current: correctRoute,
            exact: correctRoute,
            mutations: [],
        },
        {
            name: 'creates a missing route',
            current: '',
            exact: '',
            mutations: [replacement],
        },
        {
            name: 'replaces a route with an incorrect gateway',
            current: correctRoute.replace('192.168.250.12', '192.168.250.13'),
            exact: correctRoute.replace('192.168.250.12', '192.168.250.13'),
            mutations: [replacement],
        },
        {
            name: 'deletes a stale host route printed without a prefix length',
            current: `${correctRoute}198.18.0.22 via 192.168.250.12 dev eth1 proto 98 \n`,
            exact: correctRoute,
            mutations: ['-4 route del 198.18.0.22/32 proto 98'],
        },
        {
            name: 'deletes a stale host route printed with an explicit /32',
            current: `${correctRoute}198.18.0.22/32 via 192.168.250.12 dev eth1 proto 98 \n`,
            exact: correctRoute,
            mutations: ['-4 route del 198.18.0.22/32 proto 98'],
        },
        {
            name: 'preserves RFC 2544 subnet routes using the same protocol',
            current:
                correctRoute +
                '198.18.1.0/24 via 192.168.250.12 dev eth1 proto 98 \n' +
                '198.19.0.0/16 via 192.168.250.13 dev eth1 proto 98 \n',
            exact: correctRoute,
            mutations: [],
        },
    ])('$name', ({ current, exact, mutations }): void => {
        expect(applyRoutes(current, exact)).toEqual({ status: 0, mutations })
    })

    it('stops without replacing a route when the exact-route query fails', (): void => {
        expect(applyRoutes(correctRoute, '', 42)).toEqual({ status: 42, mutations: [] })
    })
})
