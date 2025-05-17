const { readFileSync } = require('node:fs')
const { URL } = require('node:url')
const crypto = require('crypto')

const prefix = 'api_'
const randomBytes = crypto.randomBytes(24).toString('hex')
const token = `${prefix}${randomBytes}`

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
