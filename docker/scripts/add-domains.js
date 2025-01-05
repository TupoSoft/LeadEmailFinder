const { readFileSync } = require('fs')
const { URL } = require('url')
const { ok } = require('node:assert')

const { env } = process
const { MONGO_URL_FILE: mongoUrlFilePath } = env
const { DISPOSABLE_DOMAINS_FILE: disposableDomainsFilePath } = env
const { FREE_DOMAINS_FILE: freeDomainsFilePath } = env

const isNonEmptyString = (val) => typeof val === 'string' && !!val

ok(isNonEmptyString(mongoUrlFilePath), 'MONGO_URL_FILE must be a non-empty string')
ok(isNonEmptyString(disposableDomainsFilePath), 'DISPOSABLE_DOMAINS_FILE must be a non-empty string')
ok(isNonEmptyString(freeDomainsFilePath), 'FREE_DOMAINS_FILE must be a non-empty string')

const mongoUrlFile = readFileSync(mongoUrlFilePath, 'utf-8')
const mongoUrl = new URL(mongoUrlFile)
const { username: user, password: pwd, pathname } = mongoUrl

const disposableDomainsFile = readFileSync(disposableDomainsFilePath, 'utf-8')
const freeDomainsFile = readFileSync(freeDomainsFilePath, 'utf-8')

const disposableDomains = JSON.parse(disposableDomainsFile)
const freeDomains = JSON.parse(freeDomainsFile)

ok(Array.isArray(disposableDomains), 'disposableDomains must be an array')
ok(Array.isArray(freeDomains), 'freeDomains must be an array')

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
