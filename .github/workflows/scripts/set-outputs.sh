#!/usr/bin/env bash

FILTER_OUTPUTS="$1"
APPS="$2"
LIBRARIES="$3"

CHANGED_APPS="[]"
CHANGED_LIBS="[]"

DEFAULT_LIBRARY_PREFIX=$(jq -r '.defaultLibraryPrefix' apps/api/nest-cli.json)

for LIB in $(echo "$LIBRARIES" | jq -r '.[]'); do
  if [[ $(echo "$FILTER_OUTPUTS" | jq -r --arg lib "$LIB" '.[$lib + "-lib"]') == "true" ]]; then
    CHANGED_LIBS=$(echo "$CHANGED_LIBS" | jq -c --arg lib "$LIB" '. += [$lib]')

    for CONSUMER in $(grep -R -l "from '${DEFAULT_LIBRARY_PREFIX}/${LIB}" apps/ | cut -d '/' -f2 | sort -u); do
      CHANGED_APPS=$(echo "$CHANGED_APPS" | jq -c --arg app $CONSUMER '. += [$app]')
    done
  fi
done

for APP in $(echo "$APPS" | jq -r '.[]'); do
  if [[ $(echo "$FILTER_OUTPUTS" | jq -r --arg app "$APP" '.[$app]') == "true" ]]; then
    CHANGED_APPS=$(echo "$CHANGED_APPS" | jq -c --arg app "$APP" '. += [$app]')
  fi
done

CHANGED_APPS=$(echo "$CHANGED_APPS" | jq -c 'unique')
CHANGED_LIBS=$(echo "$CHANGED_LIBS" | jq -c 'unique')

echo "Changed apps: $CHANGED_APPS"
echo "Changed libraries: $CHANGED_LIBS"

{
  echo "changed_apps=$CHANGED_APPS"
  echo "changed_libs=$CHANGED_LIBS"
} >> "$GITHUB_OUTPUT"
