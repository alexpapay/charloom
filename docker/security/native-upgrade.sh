#!/bin/sh
set -eu
check_deb() {
    if [ "$(dpkg-query -W -f='${Status}' "$1" 2>/dev/null || true)" = 'install ok installed' ]; then
        dpkg --compare-versions "$(dpkg-query -W -f='${Version}' "$1")" ge "$2"
    fi
}
if command -v apt-get >/dev/null 2>&1; then
    sh /opt/maintenance/install-apt-security.sh
    policy_created=false
    if ! test -e /usr/sbin/policy-rc.d; then
        printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
        chmod 755 /usr/sbin/policy-rc.d
        policy_created=true
    fi
    trap 'if [ "$policy_created" = true ]; then rm -f /usr/sbin/policy-rc.d; fi' EXIT HUP INT TERM
    apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=30 -o APT::Update::Error-Mode=any update
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get -o Acquire::Retries=0         -o Acquire::http::Timeout=30 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold         upgrade -y --no-remove
    . /etc/os-release
    case "$ID:$VERSION_CODENAME" in
        ubuntu:noble)
            check_deb apt 2.8.4ubuntu0.1
            check_deb libpcre2-8-0 10.42-4ubuntu2.2
            check_deb zlib1g 1:1.3.dfsg-3.1ubuntu2.3
            check_deb ca-certificates 20260816ubuntu0.24.04.2
            check_deb libsystemd0 255.4-1ubuntu8.18
            check_deb libudev1 255.4-1ubuntu8.18
            check_deb perl-base 5.38.2-3.2ubuntu0.7
            check_deb liblzma5 5.6.1+really5.4.5-1ubuntu0.4 ;;
        debian:trixie)
            check_deb apt 3.0.4
            check_deb zlib1g 1:1.3.dfsg+really1.3.1-1+deb13u1
            check_deb liblzma5 5.8.1-1+deb13u2
            check_deb libbrotli1 1.1.0-2+deb13u1 ;;
        *) echo "Unsupported distribution" >&2; exit 1 ;;
    esac
    command -v openssl >/dev/null
    test -z "$(dpkg --audit)"
    apt-get --simulate --no-download check
    sh /opt/maintenance/distrust-emsign.sh
    rm -rf /var/lib/apt/lists/*
elif command -v apk >/dev/null 2>&1; then
    apk upgrade --no-cache
    apk add --no-cache ca-certificates openssl
    for requirement in zlib:1.4-r0; do
        package="${requirement%%:*}"
        minimum="${requirement#*:}"
        if apk info -e "$package" >/dev/null 2>&1; then
            installed="$(apk info -v -e "$package" | sed "s/^$package-//")"
            test "$(apk version -t "$installed" "$minimum")" != '<'
        fi
    done
    case "$(cut -d. -f1,2 /etc/alpine-release)" in
        3.24)
            for requirement in libexpat:2.10.0-r0 libxslt:1.1.43-r4; do
                package="${requirement%%:*}"
                minimum="${requirement#*:}"
                if apk info -e "$package" >/dev/null 2>&1; then
                    installed="$(apk info -v -e "$package" | sed "s/^$package-//")"
                    test "$(apk version -t "$installed" "$minimum")" != '<'
                fi
            done ;;
    esac
    sh /opt/maintenance/distrust-emsign.sh
else
    echo "Unsupported native package manager" >&2
    exit 1
fi
