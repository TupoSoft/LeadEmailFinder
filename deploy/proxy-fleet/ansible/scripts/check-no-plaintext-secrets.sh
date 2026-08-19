#!/bin/sh
# Static check that no plaintext secret-shaped value appears in tracked inventory YAML. Skips any
# file whose first line is the Ansible Vault ciphertext header ($ANSIBLE_VAULT) -- vault-encrypted
# content can't match these plaintext patterns. This complements, not replaces, Ansible Vault: by
# the time a play runs, decrypted and plaintext vars are indistinguishable in hostvars, so this
# check has to run at the file level, before any play does.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
INVENTORY_DIR="${SCRIPT_DIR}/../inventory"

# Avoid a piped `find | while read`, which runs the loop in a subshell where `exit` would only end
# that subshell, not this script -- use positional parameters instead so a failure here actually
# propagates.
# shellcheck disable=SC2046 -- deliberate word-splitting of newline-separated file paths.
set -- $(find "${INVENTORY_DIR}" -type f -name '*.yml')

found_plaintext=0
for file in "$@"; do
    first_line="$(head -n 1 "${file}")"
    case "${first_line}" in
        '$ANSIBLE_VAULT'*)
            continue
            ;;
    esac

    if grep -Eq '(private_key|preshared_key|pass|token)[[:space:]]*:' "${file}"; then
        printf 'check-no-plaintext-secrets: possible plaintext secret in %s\n' "${file}" >&2
        grep -En '(private_key|preshared_key|pass|token)[[:space:]]*:' "${file}" >&2
        found_plaintext=1
    fi
done

if [ "${found_plaintext}" -ne 0 ]; then
    exit 1
fi

printf 'check-no-plaintext-secrets: no plaintext secrets found in tracked inventory.\n'
