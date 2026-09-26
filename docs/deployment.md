# Self-hosting

## Local

```sh
uv sync --locked --extra web
uv run charloom-web
```

The local command binds to `127.0.0.1:4175`. The offline CLI does not require the web extra.

## Container

```sh
docker compose up -d --build
curl --fail http://127.0.0.1:4175/healthz
```

The container runs non-root, uses a read-only root filesystem, drops capabilities and is limited to 768 MiB / 2 CPUs. Only loopback port 4175 is published. Uploads are handled in memory; no image volume is mounted. Use one worker initially so concurrency limits match the resource budget.

## HTTPS reverse proxy

An example for `charloom.popovich.one` is in [deploy/nginx.conf](../deploy/nginx.conf). Change the hostname and certificate paths for your installation. Preserve upload limits and disable proxy request buffering for conversion so uploads are not spooled to proxy temporary files.

1. Point DNS to the host and verify ports 80/443 reach it.
2. Create `/var/www/charloom-acme` and enable an HTTP-only virtual host serving `/.well-known/acme-challenge/` from that directory.
3. Obtain a certificate using your existing ACME setup, e.g. `certbot certonly --webroot -w /var/www/charloom-acme -d charloom.popovich.one`.
4. Install the complete proxy example, run `nginx -t`, then reload nginx.
5. Verify HTTPS, `/healthz`, the orbital demo and a small synthetic upload externally. Ensure certificate renewal reloads nginx.

The example limits API traffic by the connection's source address. Behind a CDN this may represent a shared edge; only configure forwarded client IP handling using that CDN's documented trusted networks. Do not trust arbitrary client-supplied IP headers.

## Updates and rollback

Keep the previous commit and local image ID before updating. Run `git pull --ff-only`, `docker compose build`, then `docker compose up -d`. Verify health and a conversion. To roll back, check out the previous commit and rebuild/restart the single Charloom service. No database migration is involved.

Application logs contain errors and startup messages, not uploaded image bodies. Review your proxy/CDN's retention independently. Do not publish credentials, source portraits, SSH configuration or certificate keys in the repository.

For this hostname, install deploy/renew-hook.sh as an executable file under /etc/letsencrypt/renewal-hooks/deploy/ so nginx reloads after certificate renewal. Adapt the hostname when self-hosting elsewhere.
