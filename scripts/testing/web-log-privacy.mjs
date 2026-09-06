import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export function privacyCases(id = randomUUID()) {
    const marker = kind => `web-privacy-${kind}-${id}`
    const markers = Object.fromEntries(
        ['code', 'state', 'invitation', 'email', 'cookie', 'authorization', 'query', 'body', 'correlation'].map(
            kind => [kind, marker(kind)],
        ),
    )
    return {
        markers: Object.values(markers),
        requests: [
            {
                path: `/v1/auth/callback?code=${markers.code}&state=${markers.state}`,
                label: '/v1/auth/callback',
                method: 'GET',
            },
            { path: `/v1/auth/login?secret=${markers.query}`, label: '/v1/auth/login', method: 'GET' },
            { path: '/v1/auth/logout', label: '/v1/auth/logout', method: 'POST' },
            {
                path: `/v1/organizations/invitations/${markers.invitation}/accept`,
                label: '/v1/organizations/invitations/:sensitive',
                apiLabel: '/v1/organizations/invitations/:sensitive/accept',
                method: 'POST',
            },
            { path: `/emails/${markers.email}%40example.test`, label: '/emails/:sensitive', method: 'GET' },
            {
                path: `/accept-invitation/${markers.invitation}`,
                label: '/accept-invitation/:sensitive',
                method: 'GET',
                ui: true,
            },
            { path: `/v1/not-real?secret=${markers.query}`, label: '/v1/*', apiLabel: '/v1/not-real', method: 'POST' },
        ].map(entry => ({
            ...entry,
            headers: {
                cookie: `lef_session=${markers.cookie}`,
                authorization: `Bearer ${markers.authorization}`,
                'x-request-id': markers.correlation,
                'content-type': 'application/json',
            },
            ...(entry.method === 'POST' ? { body: JSON.stringify({ password: markers.body }) } : {}),
        })),
    }
}

export async function sendPrivacyProbes(origin) {
    assert.match(origin, /^http:\/\/localhost:[0-9]+$/)
    const cases = privacyCases()
    const requests = []
    for (const probe of cases.requests) {
        const response = await fetch(`${origin}${probe.path}`, {
            method: probe.method,
            headers: probe.headers,
            body: probe.body,
            redirect: 'manual',
            signal: AbortSignal.timeout(15_000),
        })
        await response.arrayBuffer()
        if (probe.label === '/v1/auth/callback') {
            assert.equal(response.status, 302)
            assert.equal(response.headers.get('cache-control'), 'no-store')
            assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
            assert.equal(response.headers.get('location'), `${origin}/auth/error?code=login_state_invalid`)
        }
        requests.push({ ...probe, status: response.status, requestId: response.headers.get('x-request-id') })
    }
    return { markers: cases.markers, requests }
}

function recordsFrom(logs) {
    return logs.split('\n').flatMap(line => {
        try {
            return [JSON.parse(line)]
        } catch {
            return []
        }
    })
}

export function assertPrivateTopologyLogs({ web, api }, probes) {
    for (const [boundary, logs] of Object.entries({ web, api })) {
        for (const marker of probes.markers) {
            // Do not let assertion diagnostics reproduce the very payload this gate protects.
            assert.ok(!logs.includes(marker), `${boundary} logs disclosed a synthetic sensitive value`)
        }
    }
    const gatewayRecords = recordsFrom(web)
    const apiRecords = recordsFrom(api)
    for (const probe of probes.requests) {
        assert.ok(
            gatewayRecords.some(
                record =>
                    record.path === probe.label &&
                    record.method === probe.method &&
                    record.status === probe.status &&
                    /^[a-f0-9]{32}$/.test(record.requestId ?? ''),
            ),
            'Gateway log is missing a sanitized route, method, status, or safe request identifier',
        )
        if (!probe.ui) {
            assert.ok(
                /^[a-f0-9-]{36}$/.test(probe.requestId ?? ''),
                'API response is missing its generated request identifier',
            )
            assert.ok(
                apiRecords.some(
                    record =>
                        record.req?.path === (probe.apiLabel ?? probe.label) &&
                        record.req?.method === probe.method &&
                        record.req?.id === probe.requestId &&
                        record.res?.statusCode === probe.status,
                ),
                'API log is missing a sanitized route, method, status, or correlated request identifier',
            )
        }
    }
}
