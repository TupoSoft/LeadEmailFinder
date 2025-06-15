const { ok } = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createUserFromUrl } = require('common/create-user-from-url')
const { env, exit } = require('node:process')

const { PROXIES, PROXY_MONGO_URL_FILE } = env

ok(PROXY_MONGO_URL_FILE, 'PROXY_MONGO_URL_FILE must be set')

const mongoUrlFile = readFileSync(PROXY_MONGO_URL_FILE)
const url = new URL(mongoUrlFile)
const { pathname } = url
const dbName = pathname.slice(1)

const db = db.getSiblingDB(dbName)

createUserFromUrl({ db, url })

if (!PROXIES) {
    console.info(`There are no proxies to insert.`)
    exit(0)
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
