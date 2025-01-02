#!/usr/bin/env bash

JSON_FILE="disposable-email-providers.json"
MONGO_DB="mongodb://verifier:verifier@localhost/verifier"
MONGO_COLLECTION="domains"

if [[ ! -f "$JSON_FILE" ]]; then
  echo "ERROR: '$JSON_FILE' not found!"
  exit 1
fi

DOMAINS=$(jq -r '.[]' "$JSON_FILE")

for domain in $DOMAINS; do
  echo "Trying to update domain: $domain"

  mongosh --quiet "$MONGO_DB" --eval "
    var result = db.$MONGO_COLLECTION.updateOne(
      { _id: '$domain' },
      {
        \$set: {
          isDisposable: true,
          updatedAt: new Date()
        }
      },
      { upsert: false }
    );
    printjson(result)
  "
done

echo "Done updating disposable-email domains from '$JSON_FILE'."
