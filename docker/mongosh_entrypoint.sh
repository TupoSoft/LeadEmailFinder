#!/usr/bin/env bash

username=$(cat /run/secrets/mongo_root_username)
password=$(cat /run/secrets/mongo_root_password)
mongo_url="mongodb://$username:$password@mongo"

for script in /scripts/*.js; do
  echo "Running $script..."
  mongosh "$mongo_url" --file "$script"
done
