#!/bin/sh
set -eu
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
disabled_dir=/usr/local/share/disabled-emsign-ca
mkdir -p "$disabled_dir"
chmod 700 "$disabled_dir"

refresh_ca() {
    if command -v update-ca-certificates >/dev/null 2>&1; then
        update-ca-certificates --fresh >/dev/null
    fi
}

is_removed_root() {
    case "$1" in
        125609AA301DA0A249B97A8239CB6A34216F44DCAC9F3954B14292F2E8C8608F|BC4D809B15189D78DB3E1D8CF4F9726A795DA1643CA5F1358E1DDB0EDC0D7EB3) return 0 ;;
        *) return 1 ;;
    esac
}

filter_file() {
    source_file="$1"
    test -f "$source_file" || return 0
    rm -rf "$work_dir/parts"
    mkdir "$work_dir/parts"
    awk -v dir="$work_dir/parts" '
      /-----BEGIN CERTIFICATE-----/ { n++; file=sprintf("%s/%06d.pem", dir, n) }
      file != "" { print > file }
      /-----END CERTIFICATE-----/ { close(file); file="" }
    ' "$source_file"
    : > "$work_dir/kept"
    removed=0
    kept=0
    for part_file in "$work_dir"/parts/*.pem; do
        test -f "$part_file" || continue
        fingerprint_text="$(openssl x509 -in "$part_file" -noout -fingerprint -sha256)"
        fingerprint="$(printf '%s' "$fingerprint_text" | cut -d= -f2 | tr -d ':')"
        if is_removed_root "$fingerprint"; then
            removed=$((removed + 1))
        else
            cat "$part_file" >> "$work_dir/kept"
            kept=$((kept + 1))
        fi
    done
    if test "$removed" -eq 0; then return 0; fi
    backup_name="$(printf '%s' "$source_file" | sha256sum | cut -d' ' -f1)"
    if ! test -f "$disabled_dir/$backup_name.original"; then
        cp -L "$source_file" "$disabled_dir/$backup_name.original"
        chmod 600 "$disabled_dir/$backup_name.original"
    fi
    if test "$kept" -eq 0; then
        rm "$source_file"
    else
        cat "$work_dir/kept" > "$source_file"
    fi
}

# Disable distribution sources while keeping the original public certificates for verification.
if test -f /etc/ca-certificates.conf; then
    cp /etc/ca-certificates.conf "$work_dir/conf.before"
    : > "$work_dir/conf.after"
    while IFS= read -r entry || test -n "$entry"; do
        case "$entry" in ''|'#'*|'!'*) printf '%s\n' "$entry" >> "$work_dir/conf.after"; continue ;; esac
        cert_file="/usr/share/ca-certificates/$entry"
        if test -f "$cert_file" && test "$(grep -c -- '-----BEGIN CERTIFICATE-----' "$cert_file")" -eq 1; then
            fingerprint="$(openssl x509 -in "$cert_file" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':')"
            if is_removed_root "$fingerprint"; then
                printf '!%s\n' "$entry" >> "$work_dir/conf.after"
                continue
            fi
        fi
        printf '%s\n' "$entry" >> "$work_dir/conf.after"
        filter_file "$cert_file"
    done < "$work_dir/conf.before"
    cat "$work_dir/conf.after" > /etc/ca-certificates.conf
fi
if test -d /usr/local/share/ca-certificates; then
    find -L /usr/local/share/ca-certificates -type f -name '*.crt' -print |
    while IFS= read -r cert_file; do filter_file "$cert_file"; done
fi
refresh_ca
# Remove unmanaged aliases as well as configured sources; each file is filtered by DER fingerprint.
find /etc/ssl/certs -maxdepth 1 \( -name '*.pem' -o -name '*.crt' -o -name '*.[0-9]' \) -print |
while IFS= read -r cert_file; do filter_file "$cert_file"; done
refresh_ca
for library_root in /usr/local/lib /usr/lib /opt/venv /opt/venvs /app/.venv; do
    if test -d "$library_root"; then
        find "$library_root" -type f -path '*/certifi/cacert.pem' -print |
        while IFS= read -r cert_file; do filter_file "$cert_file"; done
    fi
done
if command -v update-ca-certificates >/dev/null 2>&1 || test -e /etc/ssl/certs/ca-certificates.crt; then
    test -s /etc/ssl/certs/ca-certificates.crt
fi
