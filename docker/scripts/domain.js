const { readFileSync } = require('node:fs')
const { ok } = require('node:assert')

const { env } = process
const { DISPOSABLE_DOMAINS_FILE: disposableDomainsFilePath } = env
const { FREE_DOMAINS_FILE: freeDomainsFilePath } = env

const isNonEmptyString = (val) => typeof val === 'string' && !!val

ok(isNonEmptyString(disposableDomainsFilePath), 'DISPOSABLE_DOMAINS_FILE must be a non-empty string')
ok(isNonEmptyString(freeDomainsFilePath), 'FREE_DOMAINS_FILE must be a non-empty string')

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

const freeDocuments = freeDomains
    .filter(value => value !== null)
    .map(( name ) => ({
        _id: name,
        isFree: true
    }))

const domainMap = {}
disposableDocuments.forEach(doc => {
    domainMap[doc._id] = {
        ...(domainMap[doc._id] || {}),
        ...doc
    }
})
freeDocuments.forEach(doc => {
    domainMap[doc._id] = {
        ...(domainMap[doc._id] || {}),
        ...doc
    }
})

const allDocuments = Object.values(domainMap)

try {
    db.domains.insertMany(allDocuments)
} catch (err) {
    console.error(`Failed to insert domains: `, err)
}
