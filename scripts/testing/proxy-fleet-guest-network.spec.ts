import { spawnSync } from 'node:child_process'
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    statSync,
    symlinkSync,
    utimesSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = readFileSync(resolve(__dirname, '../../deploy/proxy-fleet/vagrant/provision/guest-network.sh'), 'utf8')
const entrypoint = script.indexOf('\nMODE=${1-}\n')
if (entrypoint < 0) {
    throw new Error('Cannot safely isolate guest-network.sh function definitions')
}
const definitions = script.slice(0, entrypoint)
const correctRoute = '198.18.0.21 via 192.168.250.12 dev eth1 proto 98 \n'
const replacement = '-4 route replace 198.18.0.21/32 via 192.168.250.12 dev eth1 proto 98'
const verifierRoutes = '198.18.0.21/32 192.168.250.12\n198.18.0.22/32 192.168.250.12\n198.18.0.23/32 192.168.250.13'
const networkdRoutes =
    '[Route]\nDestination=198.18.0.21/32\nGateway=192.168.250.12\nProtocol=98\n\n' +
    '[Route]\nDestination=198.18.0.22/32\nGateway=192.168.250.12\nProtocol=98\n\n' +
    '[Route]\nDestination=198.18.0.23/32\nGateway=192.168.250.13\nProtocol=98\n\n'
const networkctlRead = `
networkctl() {
    [ "$*" = 'status eth1 --json=short --no-pager' ] || unexpected networkctl "$@"
    if [ "\${TEST_NETWORK_STATUS:-0}" -ne 0 ]; then return "$TEST_NETWORK_STATUS"; fi
    printf '%s\\n' "$TEST_NETWORK_JSON"
}
`
// Directory metadata and file ownership are modeled. Real temporary paths,
// symlinks, contents, and file modes are checked without running the suite as root.
const rootMetadata = `
stat() {
    [ "$1:$2" = '-c:%u:%g:%a' ] || unexpected stat "$@"
    if [ "$3" = "\${TEST_UNSAFE_PATH:-}" ]; then
        printf '%s\\n' "$TEST_UNSAFE_METADATA"
    elif [ -d "$3" ]; then
        printf '0:0:755\\n'
    else
        printf '0:0:%s\\n' "$(command stat -c '%a' "$3")"
    fi
}
`

function runNetworkdFunction(
    commands: string,
    environment: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync('sh', ['-s'], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, TEST_ROUTES: verifierRoutes, ...environment },
        input: `
${definitions}
unexpected() { printf 'Unexpected command: %s\\n' "$*" >&2; exit 64; }
ip() { unexpected ip "$@"; }
systemctl() { unexpected systemctl "$@"; }
networkctl() { unexpected networkctl "$@"; }
install() { unexpected install "$@"; }
mkdir() { unexpected mkdir "$@"; }
UNDERLAY_INTERFACE=eth1
RETURN_ROUTES=$TEST_ROUTES
${commands}
`,
    })

    expect(result.error).toBeUndefined()
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

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

describe('verifier networkd persistence', (): void => {
    let directory: string

    beforeEach((): void => {
        directory = mkdtempSync(join(tmpdir(), 'proxy-fleet-networkd-'))
    })

    afterEach((): void => {
        rmSync(directory, { recursive: true, force: true })
    })

    it('renders only the three declared host routes with the lab protocol', (): void => {
        const candidate = join(directory, 'candidate')
        expect(runNetworkdFunction('write_networkd_routes "$TEST_CANDIDATE"', { TEST_CANDIDATE: candidate })).toEqual({
            status: 0,
            stdout: '',
            stderr: '',
        })
        expect(readFileSync(candidate, 'utf8')).toBe(networkdRoutes)
    })

    it('does not configure networkd on a proxy guest', (): void => {
        expect(
            runNetworkdFunction('EGRESS_ADDRESSES=198.18.0.21/32\nconfigure_networkd_routes', { TEST_ROUTES: '' }),
        ).toEqual({ status: 0, stdout: '', stderr: '' })
    })

    it('maps the active underlay Netplan file to its single owned drop-in', (): void => {
        expect(
            runNetworkdFunction(
                `${networkctlRead}
NETWORKD_DIRECTORY=$TEST_DIRECTORY
discover_networkd_route_file
printf '%s\\n' "$NETWORKD_ROUTES_DIRECTORY" "$NETWORKD_ROUTES_FILE"
`,
                {
                    TEST_DIRECTORY: directory,
                    TEST_NETWORK_JSON: JSON.stringify({ NetworkFile: '/run/systemd/network/10-netplan-eth1.network' }),
                },
            ),
        ).toEqual({
            status: 0,
            stdout:
                `${directory}/10-netplan-eth1.network.d\n` +
                `${directory}/10-netplan-eth1.network.d/50-proxy-fleet-lab-routes.conf\n`,
            stderr: '',
        })
    })

    it.each([
        ['missing mapping', {}],
        ['unmanaged interface', { NetworkFile: null }],
        ['management interface', { NetworkFile: '/run/systemd/network/10-netplan-eth0.network' }],
        ['different manager', { NetworkFile: '/etc/systemd/network/10-netplan-eth1.network' }],
        ['relative path', { NetworkFile: '10-netplan-eth1.network' }],
        ['parent traversal', { NetworkFile: '/run/systemd/network/../network/10-netplan-eth1.network' }],
    ])('rejects %s before making changes', (_name, mapping): void => {
        const result = runNetworkdFunction(`${networkctlRead}\ndiscover_networkd_route_file`, {
            TEST_NETWORK_JSON: JSON.stringify(mapping),
        })
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).not.toContain('Unexpected command')
    })

    it.each(['../eth1', 'eth1/child', 'eth1 extra', 'eth1%p'])('rejects unsafe interface %s', (name): void => {
        const result = runNetworkdFunction('UNDERLAY_INTERFACE=$TEST_INTERFACE\ndiscover_networkd_route_file', {
            TEST_INTERFACE: name,
        })
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).not.toContain('Unexpected command')
    })

    it('stops when networkctl cannot read the active mapping', (): void => {
        const result = runNetworkdFunction(`${networkctlRead}\ndiscover_networkd_route_file`, {
            TEST_NETWORK_STATUS: '42',
            TEST_NETWORK_JSON: JSON.stringify({ NetworkFile: '/run/systemd/network/10-netplan-eth1.network' }),
        })
        expect(result.status).not.toBe(0)
        expect(result.status).not.toBe(64)
        expect(result.stdout).toBe('')
    })

    it.each(['1000:0:755', '0:1000:755', '0:0:775', '0:0:777'])(
        'rejects unsafe ancestor metadata %s',
        (metadata): void => {
            const parent = join(directory, 'parent')
            mkdirSync(parent)
            const result = runNetworkdFunction(
                `${rootMetadata}\nensure_networkd_route_directory "$TEST_DIRECTORY/parent/leaf"`,
                { TEST_DIRECTORY: directory, TEST_UNSAFE_PATH: parent, TEST_UNSAFE_METADATA: metadata },
            )
            expect(result.status).toBe(1)
            expect(result.stdout).toBe('')
            expect(result.stderr).not.toContain('Unexpected command')
        },
    )

    it('rejects a symbolic-link ancestor before creating a drop-in directory', (): void => {
        const actual = join(directory, 'actual')
        mkdirSync(actual)
        symlinkSync(actual, join(directory, 'alias'))
        const result = runNetworkdFunction(
            `${rootMetadata}\nensure_networkd_route_directory "$TEST_DIRECTORY/alias/leaf"`,
            { TEST_DIRECTORY: directory },
        )
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).not.toContain('Unexpected command')
    })

    it('creates only the missing final directory with protected ownership and permissions', (): void => {
        const leaf = join(directory, 'leaf')
        expect(
            runNetworkdFunction(
                `${rootMetadata}
install() {
    [ "$1:$2:$3:$4:$5:$6:$7" = '-d:-o:root:-g:root:-m:0755' ] || unexpected install "$@"
    [ "$8" = "$TEST_LEAF" ] || unexpected install "$@"
    command install -d -m "$7" "$8"
}
ensure_networkd_route_directory "$TEST_LEAF"
`,
                { TEST_LEAF: leaf },
            ),
        ).toEqual({ status: 0, stdout: '', stderr: '' })
        expect(statSync(leaf).isDirectory()).toBe(true)
        expect(statSync(leaf).mode & 0o777).toBe(0o755)
    })

    it('rejects a missing ancestor instead of creating an arbitrary directory chain', (): void => {
        const result = runNetworkdFunction(
            `${rootMetadata}\nensure_networkd_route_directory "$TEST_DIRECTORY/missing/leaf"`,
            { TEST_DIRECTORY: directory },
        )
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).not.toContain('Unexpected command')
    })

    it('rejects a symbolic link at the owned route file without overwriting its target', (): void => {
        const managedDirectory = join(directory, '10-netplan-eth1.network.d')
        const target = join(directory, 'foreign-file')
        mkdirSync(managedDirectory)
        writeFileSync(target, 'unrelated contents')
        symlinkSync(target, join(managedDirectory, '50-proxy-fleet-lab-routes.conf'))
        const result = runNetworkdFunction(
            `${networkctlRead}\n${rootMetadata}
NETWORKD_DIRECTORY=$TEST_DIRECTORY
configure_networkd_routes "$TEST_CANDIDATE"
`,
            {
                TEST_DIRECTORY: directory,
                TEST_CANDIDATE: join(directory, 'candidate'),
                TEST_NETWORK_JSON: JSON.stringify({ NetworkFile: '/run/systemd/network/10-netplan-eth1.network' }),
            },
        )
        expect(result.status).toBe(1)
        expect(result.stdout).toBe('')
        expect(result.stderr).not.toContain('Unexpected command')
        expect(readFileSync(target, 'utf8')).toBe('unrelated contents')
    })

    it('installs only the owned route file, preserves correct files, and repairs incorrect modes without a reload', (): void => {
        const managedDirectory = join(directory, '10-netplan-eth1.network.d')
        const managedFile = join(managedDirectory, '50-proxy-fleet-lab-routes.conf')
        const siblingFile = join(managedDirectory, '90-unrelated.conf')
        const managementFile = join(directory, '10-netplan-eth0.network')
        const candidate = join(directory, 'candidate')
        mkdirSync(managedDirectory)
        writeFileSync(siblingFile, '[Network]\nDNS=192.0.2.53\n')
        writeFileSync(managementFile, '[Network]\nDHCP=yes\n')
        const commands = `${networkctlRead}
${rootMetadata}
NETWORKD_DIRECTORY=$TEST_DIRECTORY
install() {
    [ "$1:$2:$3:$4:$5:$6" = '-o:root:-g:root:-m:0644' ] || unexpected install "$@"
    [ "$7" = "$TEST_CANDIDATE" ] && [ "$8" = "$TEST_MANAGED_FILE" ] || unexpected install "$@"
    printf 'install:%s\\n' "$8"
    command install -m "$6" "$7" "$8"
}
configure_networkd_routes "$TEST_CANDIDATE"
`
        const environment = {
            TEST_DIRECTORY: directory,
            TEST_CANDIDATE: candidate,
            TEST_MANAGED_FILE: managedFile,
            TEST_NETWORK_JSON: JSON.stringify({ NetworkFile: '/run/systemd/network/10-netplan-eth1.network' }),
        }
        const installed = { status: 0, stdout: `install:${managedFile}\n`, stderr: '' }

        expect(runNetworkdFunction(commands, environment)).toEqual(installed)
        expect(readFileSync(managedFile, 'utf8')).toBe(networkdRoutes)
        expect(statSync(managedFile).mode & 0o777).toBe(0o644)
        utimesSync(managedFile, 1, 1)

        expect(runNetworkdFunction(commands, environment)).toEqual({ status: 0, stdout: '', stderr: '' })
        expect(statSync(managedFile).mtimeMs).toBe(1000)

        chmodSync(managedFile, 0o600)
        expect(runNetworkdFunction(commands, environment)).toEqual(installed)
        expect(statSync(managedFile).mode & 0o777).toBe(0o644)
        expect(readFileSync(siblingFile, 'utf8')).toBe('[Network]\nDNS=192.0.2.53\n')
        expect(readFileSync(managementFile, 'utf8')).toBe('[Network]\nDHCP=yes\n')
    })
})
