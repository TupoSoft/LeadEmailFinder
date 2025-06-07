#!/bin/bash

NEST_CLI=$(cat nest-cli.json)

APPS=$(echo "$NEST_CLI" | jq -c '[.projects | to_entries[] | select(.value.type == "application") | .key]')
LIBRARIES=$(echo "$NEST_CLI" | jq -c '[.projects | to_entries[] | select(.value.type == "library") | .key]')

echo "Detected applications: $APPS"
echo "Detected libraries: $LIBRARIES"

{
  echo "apps=$APPS"
  echo "libraries=$LIBRARIES"
} >> "$GITHUB_OUTPUT"
