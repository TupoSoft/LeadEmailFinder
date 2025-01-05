const { readFileSync } = require('fs')
const { URL } = require('url')

const { env } = process
const { MONGO_URL_FILE: mongoUrlFilePath } = env
const { DISPOSABLE_DOMAINS_FILE: disposableDomainsFilePath } = env
const { FREE_DOMAINS_FILE: freeDomainsFilePath } = env

if (mongoUrlFilePath === undefined) {
    console.error(`The MONGO_URL_FILE variable is undefined.`)
    process.exit(1)
}

if (disposableDomainsFilePath === undefined) {
    console.error(`The DISPOSABLE_DOMAINS_FILE variable is undefined.`)
    process.exit(1)
}

if (freeDomainsFilePath === undefined) {
    console.error(`The FREE_DOMAINS_FILE variable is undefined.`)
    process.exit(1)
}

const mongoUrlFile = readFileSync(mongoUrlFilePath, 'utf-8')
const mongoUrl = new URL(mongoUrlFile)
const { username: user, password: pwd, pathname } = mongoUrl

const disposableDomainsFile = readFileSync(disposableDomainsFilePath, 'utf-8')
const freeDomainsFile = readFileSync(freeDomainsFilePath, 'utf-8')

const disposableDomains = JSON.parse(disposableDomainsFile)
if (!Array.isArray(disposableDomains)) {
    console.log(`disposableDomains is not an array`)
    process.exit(1)
}

const freeDomains = JSON.parse(freeDomainsFile)
if (!Array.isArray(freeDomains)) {
    console.log(`freeDomains is not an array`)
    process.exit(1)
}

const disposableDocuments = disposableDomains
    .filter(value => value !== null)
    .map((name) => ({
        _id: name,
        isDisposable: true
    }))

try {
    db.domains.insertMany(disposableDocuments)
} catch (err) {
    console.error(`Failed to insert disposable domains: `, err)
}

const freeDocuments = freeDomains
    .filter(value => value !== null)
    .map(( name ) => ({
        _id: name,
        isFree: true
    }))

try {
    db.domains.insertMany(freeDocuments)
} catch (err) {
    console.error(`Failed to insert free domains: `, err)
}
