const { env } = process
const { PROXIES } = env

if (!PROXIES) {
    console.info(`There are no proxies to insert. Please set the PROXIES environment variable. Exiting the script.`)
    quit()
}

const proxyUrlArray = PROXIES.split(',').map(proxy => {
    try {
        return new URL(proxy)
    } catch (error) {
        console.error(error)
        return null
    }
})

const proxyDocuments = proxyUrlArray
    .filter(value => value !== null)
    .map(({ protocol, hostname, port, username, password }) => ({
        type: protocol.replace(':', ''),
        host: hostname,
        port: Number(port),
        user: username,
        password,
    }))

try {
    db.proxies.insertMany(proxyDocuments)
} catch (err) {
    console.error(`Failed to insert proxies: `, err)
}

console.info(`Proxies were successfully inserted.`)
