import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BlockList } from 'node:net'
import test from 'node:test'
import { parseDocument } from 'yaml'

function read(relativePath) {
    return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function compose(relativePath) {
    const document = parseDocument(read(relativePath), {
        customTags: [{ tag: '!override', collection: 'seq', resolve: sequence => sequence }],
    })
    assert.deepEqual(document.errors, [], `Invalid Compose YAML: ${relativePath}`)
    assert.deepEqual(document.warnings, [], `Unsupported Compose YAML: ${relativePath}`)
    return document.toJS()
}

const base = compose('../compose.yaml')
const infra = compose('../infra.yaml')
const overlay = compose('../compose.smtp-dev.yaml')
const baseServices = { ...infra.services, ...base.services }

function networks(service) {
    const configured = service.networks ?? { default: null }
    return Array.isArray(configured) ? configured : Object.keys(configured)
}

function service(name) {
    assert.ok(baseServices[name] || overlay.services[name], `Missing service: ${name}`)
    return { ...baseServices[name], ...overlay.services[name] }
}

function assertConnected(source, target) {
    const sourceNetworks = networks(service(source))
    assert.ok(
        networks(service(target)).some(network => sourceNetworks.includes(network)),
        `${source} must share a network with ${target}`,
    )
}

test('enabling SMTP fixtures preserves the default network and existing infrastructure attachments', () => {
    const existingDefault = base.networks?.default ?? infra.networks?.default ?? {}
    assert.deepEqual(
        overlay.networks?.default ?? existingDefault,
        existingDefault,
        'Changing default network IPAM replaces the shared network and can lose existing service aliases',
    )

    for (const [name, configuration] of Object.entries(infra.services)) {
        assert.deepEqual(networks(service(name)), networks(configuration), `${name} must stay on its existing network`)
        assert.equal(service(name).network_mode, configuration.network_mode)
    }
    assertConnected('web', 'api')
})

test('SMTP and infrastructure dependencies remain reachable, including CoreDNS alias forwarding', () => {
    for (const [source, target] of [
        ['smtp-dev-dns-cache-reset', 'redis'],
        ['api', 'redis'],
        ['api', 'postgres'],
        ['api', 'garage'],
        ['api', 'keycloak'],
        ['smtp-dev-proxy-bootstrap', 'api'],
        ['smtp-dev-proxy-bootstrap', 'keycloak'],
        ['smtp-dev-proxy-cleanup', 'api'],
        ['smtp-dev-proxy-cleanup', 'keycloak'],
        ['api', 'coredns'],
        ['api', 'smtp-dev-proxy'],
        ['smtp-dev-proxy-bootstrap', 'coredns'],
        ['smtp-dev-proxy-bootstrap', 'smtp-dev-proxy'],
        ['smtp-dev-proxy', 'coredns'],
        ['smtp-dev-proxy', 'smtp-evidence'],
        ['smtp-dev-proxy', 'plaintext-mailpit'],
        // Forwarded Docker service names are resolved from CoreDNS's own network attachments.
        ['coredns', 'keycloak'],
        ['coredns', 'redis'],
    ]) {
        assertConnected(source, target)
    }

    const dnsAddress = service('coredns').networks['smtp-dev'].ipv4_address
    assert.deepEqual(service('api').dns, [dnsAddress])
    assert.deepEqual(service('smtp-dev-proxy-bootstrap').dns, [dnsAddress])
    assert.match(read('./coredns/Corefile'), /^\s*forward\s+\.\s+127\.0\.0\.11\s*$/m)
})

test('fixture DNS records and proxy routing agree with the dedicated network addresses', () => {
    const subnet = overlay.networks['smtp-dev'].ipam.config[0].subnet
    const [subnetAddress, prefixLength] = subnet.split('/')
    const addressRange = new BlockList()
    addressRange.addSubnet(subnetAddress, Number(prefixLength), 'ipv4')
    const zoneAddresses = new Map(
        [...read('./coredns/lef.test.zone').matchAll(/^(\S+)\s+\d+\s+IN\s+A\s+(\S+)\s*$/gm)]
            .map(([, hostname, address]) => [hostname, address]),
    )
    const assignedAddresses = new Set()
    for (const [hostname, serviceName] of [
        ['ns', 'coredns'],
        ['smtp', 'smtp-evidence'],
        ['smtp-plaintext', 'plaintext-mailpit'],
        ['smtp-dev-proxy', 'smtp-dev-proxy'],
    ]) {
        const address = service(serviceName).networks['smtp-dev'].ipv4_address
        assert.ok(addressRange.check(address, 'ipv4'), `${serviceName} must use an address within ${subnet}`)
        assert.equal(zoneAddresses.get(hostname), address, `${hostname}.lef.test must resolve to ${serviceName}`)
        assert.ok(!assignedAddresses.has(address), `${address} must not be assigned twice`)
        assignedAddresses.add(address)
    }

    const proxyLines = read('./3proxy.cfg').split('\n').map(line => line.trim().split(/\s+/))
    assert.deepEqual(proxyLines.find(([directive]) => directive === 'nserver'), ['nserver', zoneAddresses.get('ns')])
    assert.equal(proxyLines.find(([directive]) => directive === 'allow')?.[2], subnet)
})

test('SMTP fixtures remain internal and mail/proxy servers stay off the application network', () => {
    for (const [name, configuration] of Object.entries(overlay.services)) {
        if (baseServices[name]) continue
        assert.deepEqual(configuration.ports ?? [], [], `${name} must not publish fixture ports on the host`)
        assert.equal(configuration.network_mode, undefined, `${name} must use the configured Docker networks`)
    }
    for (const name of ['smtp-evidence', 'plaintext-mailpit', 'smtp-dev-proxy']) {
        assert.deepEqual(networks(service(name)), ['smtp-dev'], `${name} must stay on the fixture network`)
    }
})
