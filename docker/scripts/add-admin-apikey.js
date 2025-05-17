const { readFileSync } = require('node:fs')
const { URL } = require('node:url')
const { ok } = require('node:assert')
const { env } = process

const { ADMIN_APIKEY_FILE: adminApikeyFilePath } = env

const isNonEmptyString = val => typeof val === 'string' && !!val

ok(isNonEmptyString(adminApikeyFilePath), 'ADMIN_APIKEY_FILE must be a non-empty string')

const adminApikeyFile = readFileSync(adminApikeyFilePath, 'utf-8')
const token = adminApikeyFile.toString().replace(/\s+/g, '')

try {
  db.keys.insertOne({
    token,
    permissions: ['admin'],
    revoked: false,
    description: 'Hardcoded key for local env',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
} catch (err) {
  console.error(`Failed to insert domains: `, err)
}
