#!/bin/sh
set -efu
PATH='/usr/sbin:/usr/bin:/sbin:/bin' LC_ALL='C'; export PATH LC_ALL
PROGRAM='proxy-fleet lab network'
HELPER='/usr/local/libexec/proxy-fleet-lab-network'
UNIT_NAME='proxy-fleet-lab-network.service'
UNIT="/etc/systemd/system/$UNIT_NAME"
NETWORKD_DIRECTORY='/etc/systemd/network'
# A lab-reserved numeric protocol lets the verifier prune only routes created by this script.
ROUTE_PROTOCOL='98'
fail() {
    printf '%s: %s\n' "$PROGRAM" "$1" >&2
    exit 1
}
valid_ipv4() {
    printf '%s\n' "$1" | awk -F. 'NF != 4 { exit 1 } { for (i = 1; i <= 4; i += 1)
        if ($i !~ /^[0-9]+$/ || length($i) > 3 || ($i != "0" && substr($i, 1, 1) == "0") || $i > 255) exit 1 }'
}
valid_underlay() {
    case "$1" in
        */24) address=${1%/24} ;;
        *) return 1 ;;
    esac
    valid_ipv4 "$address" || return 1
    last_octet=${address##*.}
    [ "$last_octet" -ge 1 ] && [ "$last_octet" -le 254 ]
}
valid_egress() {
    case "$1" in
        */32) address=${1%/32} ;;
        *) return 1 ;;
    esac
    valid_ipv4 "$address" || return 1
    case "$address" in
        198.18.* | 198.19.*) return 0 ;;
        *) return 1 ;;
    esac
}
contains_line() {
    [ -n "$1" ] && printf '%s\n' "$1" | grep -F -x -q -- "$2"
}
parse_arguments() {
    UNDERLAY_CIDR='' EGRESS_INTERFACE='' EGRESS_ADDRESSES='' RETURN_ROUTES='' RETURN_DESTINATIONS=''
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --underlay-cidr)
                if [ -n "$UNDERLAY_CIDR" ] || [ "$#" -lt 2 ]; then
                    fail 'invalid arguments'
                fi
                valid_underlay "$2" || fail 'invalid underlay CIDR'
                UNDERLAY_CIDR=$2
                shift 2
                ;;
            --egress-interface)
                if [ -n "$EGRESS_INTERFACE" ] || [ "$#" -lt 2 ]; then
                    fail 'invalid arguments'
                fi
                [ "$2" = 'lef-egress0' ] || fail 'invalid egress interface'
                EGRESS_INTERFACE=$2
                shift 2
                ;;
            --egress-address)
                if [ "$#" -lt 2 ] || ! valid_egress "$2"; then
                    fail 'invalid egress address'
                fi
                contains_line "$EGRESS_ADDRESSES" "$2" && fail 'duplicate egress address'
                EGRESS_ADDRESSES="${EGRESS_ADDRESSES}${EGRESS_ADDRESSES:+
}$2"
                shift 2
                ;;
            --return-route)
                if [ "$#" -lt 3 ] || ! valid_egress "$2" || ! valid_ipv4 "$3"; then
                    fail 'invalid return route'
                fi
                contains_line "$RETURN_DESTINATIONS" "$2" && fail 'duplicate return route'
                RETURN_ROUTES="${RETURN_ROUTES}${RETURN_ROUTES:+
}$2 $3"
                RETURN_DESTINATIONS="${RETURN_DESTINATIONS}${RETURN_DESTINATIONS:+
}$2"
                shift 3
                ;;
            *) fail 'invalid arguments' ;;
        esac
    done
    if [ -z "$UNDERLAY_CIDR" ] || [ "$EGRESS_INTERFACE" != 'lef-egress0' ]; then
        fail 'missing arguments'
    fi
    [ -n "$EGRESS_ADDRESSES" ] || [ -n "$RETURN_ROUTES" ] || fail 'missing network intent'
    ! { [ -n "$EGRESS_ADDRESSES" ] && [ -n "$RETURN_ROUTES" ]; } || fail 'mixed network intent'
    underlay_prefix=${UNDERLAY_CIDR%.*}
    while IFS=' ' read -r destination gateway; do
        [ -z "$destination" ] && continue
        [ "${gateway%.*}" = "$underlay_prefix" ] || fail 'return-route gateway is outside the underlay'
    done <<EOF
$RETURN_ROUTES
EOF
}
discover_underlay_interface() {
    UNDERLAY_INTERFACE=$(ip -o -4 address show | awk -v target="$UNDERLAY_CIDR" '
        $3 == "inet" && $4 == target { name = $2; sub(/@.*/, "", name); print name }
    ')
    case "$UNDERLAY_INTERFACE" in
        '' | *'
'*) fail 'underlay interface is missing or ambiguous' ;;
    esac
    [ "$UNDERLAY_INTERFACE" != "$EGRESS_INTERFACE" ] || fail 'underlay interface conflicts with egress interface'
}
discover_networkd_route_file() {
    case "$UNDERLAY_INTERFACE" in
        '' | '.' | '..' | -* | *[!a-zA-Z0-9_.-]*) fail 'underlay interface is unsafe for networkd configuration' ;;
    esac
    command -v networkctl >/dev/null 2>&1 || fail 'required command is unavailable: networkctl'
    network_status=$(networkctl status "$UNDERLAY_INTERFACE" --json=short --no-pager)
    # Read the single unescaped string field emitted by the pinned networkctl JSON format.
    # Missing, duplicate, null, escaped, or unexpected paths fail the exact comparison.
    network_file=$(printf '%s\n' "$network_status" | awk -F '"' '
        { for (i = 2; i <= NF; i += 2) if ($i == "NetworkFile") {
            count += 1
            if ($(i + 1) !~ /^[[:space:]]*:[[:space:]]*$/) exit 1
            print $(i + 2)
        } }
        END { if (count != 1) exit 1 }
    ') || fail 'underlay network metadata has no unique network file'
    network_basename="10-netplan-$UNDERLAY_INTERFACE.network"
    [ "$network_file" = "/run/systemd/network/$network_basename" ] ||
        fail 'underlay is not managed by the expected Vagrant Netplan network file'
    NETWORKD_ROUTES_DIRECTORY="$NETWORKD_DIRECTORY/$network_basename.d"
    NETWORKD_ROUTES_FILE="$NETWORKD_ROUTES_DIRECTORY/50-proxy-fleet-lab-routes.conf"
}
ensure_networkd_route_directory() {
    route_directory=$1
    case "$route_directory" in
        /*) ;;
        *) fail 'networkd route directory is unsafe' ;;
    esac
    checked_directory=$route_directory
    while :; do
        if [ -e "$checked_directory" ] || [ -L "$checked_directory" ]; then
            if [ ! -d "$checked_directory" ] || [ -L "$checked_directory" ]; then
                fail 'networkd route directory is unsafe'
            fi
            stat -c '%u:%g:%a' "$checked_directory" |
                awk -F: '$1 == 0 && $2 == 0 && $3 ~ /^[0-7]*[0-7][0145][0145]$/ { safe = 1 } END { exit !safe }' ||
                fail 'networkd route directory is unsafe'
        elif [ "$checked_directory" != "$route_directory" ]; then
            fail 'networkd route parent directory is missing'
        fi
        [ "$checked_directory" != '/' ] || break
        checked_directory=${checked_directory%/*}
        [ -n "$checked_directory" ] || checked_directory='/'
    done
    if [ ! -d "$route_directory" ]; then
        install -d -o root -g root -m 0755 "$route_directory"
    fi
}
write_networkd_routes() {
    route_candidate=$1
    while IFS=' ' read -r destination gateway; do
        [ -z "$destination" ] && continue
        printf '[Route]\nDestination=%s\nGateway=%s\nProtocol=%s\n\n' \
            "$destination" "$gateway" "$ROUTE_PROTOCOL"
    done <<EOF >"$route_candidate"
$RETURN_ROUTES
EOF
}
configure_networkd_routes() {
    [ -n "$RETURN_ROUTES" ] || return 0
    discover_networkd_route_file
    ensure_networkd_route_directory "$NETWORKD_ROUTES_DIRECTORY"
    write_networkd_routes "$1"
    install_if_changed "$1" "$NETWORKD_ROUTES_FILE" 0644
    # Existing exact-route reconciliation applies immediately. A later boot or Netplan
    # refresh reads this drop-in without a broad reload during guest provisioning.
}
apply_egress() {
    if ip link show dev "$EGRESS_INTERFACE" >/dev/null 2>&1; then
        ip -d -o link show dev "$EGRESS_INTERFACE" | grep -Eq '(^|[[:space:]])dummy([[:space:]]|$)' ||
            fail 'egress interface is not a dummy link'
    else
        ip link add name "$EGRESS_INTERFACE" type dummy
    fi
    ip link set dev "$EGRESS_INTERFACE" up
    current=$(ip -o -4 address show dev "$EGRESS_INTERFACE" | awk '$3 == "inet" { print $4 }')
    while IFS= read -r address; do
        [ -z "$address" ] && continue
        contains_line "$EGRESS_ADDRESSES" "$address" || ip -4 address del "$address" dev "$EGRESS_INTERFACE"
    done <<EOF
$current
EOF
    while IFS= read -r address; do
        [ -z "$address" ] && continue
        contains_line "$current" "$address" || ip -4 address add "$address" dev "$EGRESS_INTERFACE"
    done <<EOF
$EGRESS_ADDRESSES
EOF
}
apply_routes() {
    current=$(ip -N -o -4 route show table main proto "$ROUTE_PROTOCOL" | awk '
        $1 ~ /^198\.(18|19)\.[0-9]+\.[0-9]+(\/32)?$/ {
            destination = $1
            if (destination !~ /\//) destination = destination "/32"
            print destination
        }
    ')
    while IFS= read -r destination; do
        [ -z "$destination" ] && continue
        contains_line "$RETURN_DESTINATIONS" "$destination" ||
            ip -4 route del "$destination" proto "$ROUTE_PROTOCOL"
    done <<EOF
$current
EOF
    while IFS=' ' read -r destination gateway; do
        [ -z "$destination" ] && continue
        destination_ip=${destination%/32}
        expected="$destination_ip via $gateway dev $UNDERLAY_INTERFACE proto $ROUTE_PROTOCOL"
        observed=$(ip -N -o -4 route show table main exact "$destination")
        # Preserve a failed route read above, then normalize iproute2's trailing whitespace.
        observed=$(printf '%s\n' "$observed" | awk '{$1 = $1; print}')
        [ "$observed" = "$expected" ] ||
            ip -4 route replace "$destination" via "$gateway" dev "$UNDERLAY_INTERFACE" proto "$ROUTE_PROTOCOL"
    done <<EOF
$RETURN_ROUTES
EOF
}
write_unit() {
    unit_candidate=$1
    {
        printf '%s\n' '[Unit]' 'Description=Proxy Fleet Lab network' 'Wants=network-online.target' \
            'After=network-online.target' 'Before=wg-quick@wg0.service docker.service' '' \
            '[Service]' 'Type=oneshot'
        printf 'ExecStart=%s apply --underlay-cidr %s --egress-interface %s' \
            "$HELPER" "$UNDERLAY_CIDR" "$EGRESS_INTERFACE"
        printf '%s\n' "$EGRESS_ADDRESSES" | awk 'NF { printf " --egress-address %s", $0 }'
        printf '%s\n' "$RETURN_ROUTES" | awk 'NF { printf " --return-route %s %s", $1, $2 }'
        printf '\n%s\n' 'RemainAfterExit=yes' '' '[Install]' 'WantedBy=multi-user.target'
    } >"$unit_candidate"
}
install_if_changed() {
    source=$1 target=$2 mode=$3
    CHANGED=0
    if [ -e "$target" ] || [ -L "$target" ]; then
        if [ ! -f "$target" ] || [ -L "$target" ]; then
            fail 'managed path is unsafe'
        fi
        if cmp -s "$source" "$target" && [ "$(stat -c '%u:%g:%a' "$target")" = "0:0:${mode#0}" ]; then
            return 0
        fi
    fi
    install -o root -g root -m "$mode" "$source" "$target"
    CHANGED=1
}
ensure_helper_directory() {
    if [ -e /usr/local/libexec ] || [ -L /usr/local/libexec ]; then
        if [ ! -d /usr/local/libexec ] || [ -L /usr/local/libexec ]; then
            fail 'helper directory is unsafe'
        fi
        stat -c '%u:%g:%a' /usr/local/libexec |
            awk -F: '$1 == 0 && $2 == 0 && $3 ~ /^[0-7]*[0-7][0145][0145]$/ { safe = 1 } END { exit !safe }' ||
            fail 'helper directory is unsafe'
        return 0
    fi
    install -d -o root -g root -m 0755 /usr/local/libexec
}
MODE=${1-}
case "$MODE" in
    configure | apply) shift ;;
    *) fail 'expected configure or apply' ;;
esac
parse_arguments "$@"
for command in awk cmp grep id install ip mktemp rm stat systemctl; do
    command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done
[ "$(id -u)" = '0' ] || fail 'must run as root'
discover_underlay_interface
if [ "$MODE" = 'apply' ]; then
    if [ -n "$EGRESS_ADDRESSES" ]; then
        apply_egress
    else
        apply_routes
    fi
    exit 0
fi
unit_candidate=$(mktemp /tmp/proxy-fleet-lab-network.XXXXXX)
trap 'rm -f -- "$unit_candidate"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
configure_networkd_routes "$unit_candidate"
ensure_helper_directory
install_if_changed "$0" "$HELPER" 0755
write_unit "$unit_candidate"
install_if_changed "$unit_candidate" "$UNIT" 0644
[ "$CHANGED" -eq 0 ] || systemctl daemon-reload
systemctl enable "$UNIT_NAME" >/dev/null
systemctl restart "$UNIT_NAME"
