#!/bin/sh
set -eu
case " ${RENEWED_DOMAINS:-} " in
  *" charloom.popovich.one "*) nginx -t && systemctl reload nginx ;;
esac
