const { env } = process
const { PROXIES } = env

const proxyUrlArray = PROXIES.split(',').map(proxy => new URL(proxy))

const proxyDocuments = proxyUrlArray.map(({ protocol, hostname, port, username, password }) => ({
    type: protocol.replace(':', ''),
    host: hostname,
    port: Number(port),
    user: username,
    password,
}))

try {
    db.proxy.insertMany(proxyDocuments)
} catch (err) {
    print(`Failed to insert proxies: `, err)
}

print(`Proxies were successfully inserted.`)
