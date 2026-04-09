const { readFileSync } = require('node:fs')
const assert = require('node:assert')
const { env } = process

const { ADMIN_APIKEY_FILE: adminApikeyFilePath } = env

const isNonEmptyString = val => typeof val === 'string' && !!val

assert.ok(isNonEmptyString(adminApikeyFilePath), 'ADMIN_APIKEY_FILE must be a non-empty string')

const adminApikeyFile = readFileSync(adminApikeyFilePath, 'utf-8')
const token = adminApikeyFile.toString().replace(/\s+/g, '')

db.keys.insertOne({
    token,
    permissions: ['admin'],
    description: 'Hardcoded key for local env',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
})
