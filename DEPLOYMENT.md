# Deployment Guide

How Threat Level Trivia is hosted and how all the pieces fit together.

---

## Architecture Overview

```
User browser
     |
     | HTTPS (443)
     v
Cloudflare Edge (DNS + Proxy)
     |
     | Encrypted tunnel (outbound from VPS - no open inbound ports)
     v
Cloudflare Tunnel (cloudflared) on VPS
     |
     | HTTP (localhost:3000)
     v
Python HTTP Server (server.py)
     |
     | reads/writes
     v
/root/threat-level-trivia/data/*.json
```

No port 3000 is ever exposed to the internet. All traffic flows through the Cloudflare Tunnel, which makes an outbound connection from the VPS to Cloudflare's edge. Cloudflare handles HTTPS/SSL automatically.

---

## Infrastructure

| Component | Provider | Details |
|---|---|---|
| VPS | Akamai Cloud (Linode) | Nanode 1GB, Ubuntu 22.04 LTS, $5/month |
| Server IP | - | 172.239.66.4 |
| Domain | Namecheap (registered) | threatleveltrivia.com |
| DNS + Proxy | Cloudflare (free) | Nameservers point to Cloudflare |
| SSL/HTTPS | Cloudflare Tunnel (free) | No cert needed on the server |

---

## Services on the VPS

Both services are managed by **systemd** and start automatically on reboot.

### tlt-server (Python HTTP Server)

| Property | Value |
|---|---|
| Service file | `/etc/systemd/system/tlt-server.service` |
| What it runs | `python3 server.py` |
| Working directory | `/root/threat-level-trivia` |
| Port | `localhost:3000` (not exposed publicly) |
| Restarts | Automatically on crash (RestartSec=5) |

### tlt-tunnel (Cloudflare Tunnel)

| Property | Value |
|---|---|
| Service file | `/etc/systemd/system/tlt-tunnel.service` |
| What it runs | `cloudflared tunnel run threat-level-trivia` |
| Tunnel ID | `7f29cd68-dc9b-4755-a9d5-2d918d13272d` |
| Config file | `/root/.cloudflared/config.yml` |
| Credentials | `/root/.cloudflared/7f29cd68-dc9b-4755-a9d5-2d918d13272d.json` |
| Restarts | Automatically on crash (RestartSec=5) |

---

## DNS Records (Cloudflare)

| Name | Type | Content | Proxied |
|---|---|---|---|
| threatleveltrivia.com | CNAME | `7f29cd68-dc9b-4755-a9d5-2d918d13272d.cfargotunnel.com` | Yes |
| www.threatleveltrivia.com | CNAME | `7f29cd68-dc9b-4755-a9d5-2d918d13272d.cfargotunnel.com` | Yes |

Both root and www point to the same tunnel. MX records are also present for email forwarding (Namecheap default).

---

## Tunnel Ingress Config

`/root/.cloudflared/config.yml`:

```yaml
tunnel: 7f29cd68-dc9b-4755-a9d5-2d918d13272d
credentials-file: /root/.cloudflared/7f29cd68-dc9b-4755-a9d5-2d918d13272d.json

ingress:
  - hostname: threatleveltrivia.com
    service: http://localhost:3000
  - hostname: www.threatleveltrivia.com
    service: http://localhost:3000
  - service: http_status:404
```

---

## Key Files on VPS

```
/root/threat-level-trivia/       - project root (cloned from GitHub)
  server.py                      - Python HTTP server
  index.html                     - single-page app entry point
  js/                            - all JavaScript (app, admin, data, etc.)
  css/                           - styles
  data/                          - runtime JSON files (gitignored)
    disputes.json
    ratings.json
    leaderboard.json
    feedback.json
    custom-questions.json
    disabled-questions.json
    deleted-questions.json
    question-edits.json
    question-suggestions.json
    tags.json
    votes.json
  .env                           - admin password (gitignored, must be set manually)

/root/.cloudflared/
  config.yml                     - tunnel ingress rules
  7f29cd68-...json               - tunnel credentials (from cloudflare login)

/etc/systemd/system/
  tlt-server.service             - systemd unit for Python server
  tlt-tunnel.service             - systemd unit for cloudflared
```

---

## Environment Variables

The server reads `/root/threat-level-trivia/.env` on startup.

```
ADMIN_PASSWORD=yourpasswordhere
```

This file is **gitignored** and must be created manually on the VPS after each fresh clone. After creating or changing it, restart the server:

```bash
systemctl restart tlt-server
```

---

## Common Management Commands

### Check service status
```bash
systemctl status tlt-server tlt-tunnel
```

### View live logs
```bash
journalctl -u tlt-server -f
journalctl -u tlt-tunnel -f
```

### Restart services
```bash
systemctl restart tlt-server
systemctl restart tlt-tunnel
```

### Stop / start
```bash
systemctl stop tlt-server
systemctl start tlt-server
```

---

## Deploying Updates

1. On your local machine, commit and push changes to GitHub
2. SSH into the VPS: `ssh root@172.239.66.4`
3. Pull the latest code:
   ```bash
   cd /root/threat-level-trivia
   git pull origin main
   ```
4. Restart the server:
   ```bash
   systemctl restart tlt-server
   ```

No tunnel restart needed for code changes - only restart `tlt-tunnel` if you change `/root/.cloudflared/config.yml`.

---

## Uptime Monitoring

Monitored via **UptimeRobot** (free tier).

| Property | Value |
|---|---|
| Public status page | https://stats.uptimerobot.com/pdpjLtIqze |
| What it monitors | threatleveltrivia.com availability |

The status page shows current uptime, response time history, and incident log. UptimeRobot pings the site at regular intervals and sends an alert if it goes down.

---

## Firewall

Only two ports are open on the VPS:

| Port | Purpose |
|---|---|
| 22 | SSH access |
| 443 | HTTPS (handled by Cloudflare Tunnel outbound - not actually inbound) |

Port 3000 is bound to `localhost` only and is never exposed publicly.

---

## GitHub Repo

Private repo: `https://github.com/joshnave00-coder/threat-level-trivia`

Files excluded from version control (see `.gitignore`):
- `data/` - runtime JSON, accumulates real user data
- `.env` - admin password
- `.claude/` - local IDE config
- `memory/` - Claude Code memory files
- `__pycache__/`, `*.pyc` - Python bytecode
