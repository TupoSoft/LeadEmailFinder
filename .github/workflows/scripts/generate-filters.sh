#!/bin/bash

NEST_CLI=$(cat nest-cli.json)

APPS=$(echo "$NEST_CLI" | jq -c '[.projects | to_entries[] | select(.value.type == "application") | .key]')
LIBRARIES=$(echo "$NEST_CLI" | jq -c '[.projects | to_entries[] | select(.value.type == "library") | .key]')

# Common filter patterns
COMMON_FILTERS=(
  "package.json"
  "pnpm-lock.yaml"
  "nest-cli.json"
  "tsconfig*.json"
  "Dockerfile"
)

add_filter_section() {
  local name="$1"
  local path="$2"

  FILTERS+="${name}:\n"
  FILTERS+="  - '${path}/**'\n"

  for filter in "${COMMON_FILTERS[@]}"; do
    FILTERS+="  - '${filter}'\n"
  done
}

# Initialize with any-change filter
FILTERS="any-change:\n"
FILTERS+="  - 'apps/**'\n"
FILTERS+="  - 'libs/**'\n"
for filter in "${COMMON_FILTERS[@]}"; do
  FILTERS+="  - '${filter}'\n"
done

add_filter_section "any-app-changed" "apps"
add_filter_section "any-lib-changed" "libs"

# Add app-specific filters
for APP in $(echo "$APPS" | jq -r '.[]'); do
  add_filter_section "$APP" "apps/${APP}"
done

# Add library-specific filters
for LIB in $(echo "$LIBRARIES" | jq -r '.[]'); do
  add_filter_section "${LIB}-lib" "libs/${LIB}"
done

# Output to GitHub Actions
{
  echo "filters<<EOF"
  echo -e "$FILTERS"
  echo "EOF"
} >> "$GITHUB_OUTPUT"
