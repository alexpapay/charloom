#!/bin/sh
set -eu
. /etc/os-release
case "$ID:$VERSION_CODENAME" in
    debian:bookworm) minimum=2.6.2; library=libapt-pkg6.0 ;;
    debian:trixie) minimum=3.0.4; library=libapt-pkg7.0 ;;
    ubuntu:noble) minimum=2.8.4ubuntu0.1; library=libapt-pkg6.0t64 ;;
    *) echo "Review the APT security minimum for $ID:$VERSION_CODENAME" >&2; exit 1 ;;
esac

packages="apt $library"
for package in apt-utils apt-transport-https; do
    if [ "$(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true)" = 'install ok installed' ]; then
        packages="$packages $package"
    fi
done

upgrade_required=false
for package in $packages; do
    if ! dpkg --compare-versions "$(dpkg-query -W -f='${Version}' "$package")" ge "$minimum"; then
        upgrade_required=true
    fi
done

if [ "$upgrade_required" = true ]; then
    # CVE-2026-109518 needs download retries; bootstrap the fixed APT without them.
    apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=30 update
    DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=30 \
        install -y --no-install-recommends --only-upgrade --no-remove $packages
fi

for package in $packages; do
    dpkg --compare-versions "$(dpkg-query -W -f='${Version}' "$package")" ge "$minimum"
done
test -z "$(dpkg --audit)"
apt-get -o Acquire::Retries=0 --simulate --no-download check
