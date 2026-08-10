#!/bin/sh
set -eu

export GARAGE_DEFAULT_ACCESS_KEY="$(cat /run/secrets/s3_access_key_id)"
export GARAGE_DEFAULT_SECRET_KEY="$(cat /run/secrets/s3_secret_key)"
export GARAGE_DEFAULT_BUCKET="batch-email-verification"

exec /garage server --single-node --default-bucket
