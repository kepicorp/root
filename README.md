# Root

A web implementation of the asymmetric woodland board game *Root*, played solo against AI opponents or with friends through a hosted website anyone can create or join games on.

## Prerequisites for building from source or running locally

### Recommended

[nvm](https://github.com/nvm-sh/nvm#installing-and-updating) - Node Version Manager (Installs both Node.js and npm automatically)

An Integrated Development Environment (IDE) - Like [Microsoft Visual Studio Code](https://code.visualstudio.com/download)

### Required

[npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) - Node Package Manager (Included with nvm)

[Node.js](https://nodejs.org/) - (Included with nvm)

[git](https://git-scm.com/install/) - change tracking and version control system (used to clone this GitHub repository)

Terminal/command prompt/Powershell

### Optional

Docker - [Docker Desktop](https://www.docker.com/products/docker-desktop/) is the recommended download/install method for personal use

## Quick start

Clone into the repository and set your current directory to the repo root (literally "root" in this case).
```bash
git clone https://github.com/kepicorp/root.git
```

```bash
cd root
```

Then run:

```bash
npm install
```

If it complains with an error like `6 packages had install scripts blocked because they are not covered by allowScripts`, don't worry. You don't need those packages.


If it gives errors, feel free to run the following command to fix some of them:

```bash
npm audit fix
```

### Solo (for single-player play or development)

```bash
npm run dev
```

Open <http://localhost:5173>, pick a faction, and play.

### Hosted (both development and server, no Docker)

```bash
npm run build
```

Then:

```bash
npm run host
```

Starts Vite on `:5173` with hot reload and the multi-room server on `:8787`.

### Hosted with Docker

For both Docker methods, room data persists to a Docker volume and survives container rebuilds. If on windows, make sure to run the Docker commands in `command prompt`, *not* `powershell` and, if copy and pasting, choose "paste as single line" if prompted.

### Pre-built (currently unavailable)

```bash
docker compose pull && docker compose up -d
```

Pulls the pre-built image from `docker.kepi.site` and starts the server on **port 8787**.

### Build and run your own docker image

Set your active directory to the root of the repo. Then:

```bash
docker build -t root-board-game .
```

Then to create a container:

```bash
docker run -d
  --name Root-Board-Game-Container
  -p <external-port>:8787/tcp
  -e EXTERNAL_PORT=<external-port>
  -e DEVICE_IP=<device-ip>
  -e ADMIN_PASSWORD=<admin-secret>
  -e SITE_PASSWORD=<site-secret>
  root-board-game
  && docker logs --follow Root-Board-Game-Container
```

Replace:

`<external-port>` --> Port you want to access the app on. (eg. 8787, 5000)

`<device-ip>` --> Your device's private IP address. You can find this easily by running `node scripts/get-ip.mjs`

`<admin-secret>` --> Admin UI password. If not set, all admin pages are blocked.

`<site-secret>` --> Sitewide access password

`<admin-secret>` and `<site-secret>` are optional. If you don't want to use one or both of them, just remove the corresponding line in the above code.

<br>

The below example sets the external port to `8787`, disables both passwords, and leaves the device IP address as a placeholder:

```bash
docker run -d
  --name Root-Board-Game-Container
  -p 8787:8787
  -e EXTERNAL_PORT=8787
  -e DEVICE_IP=device-ip
  root-board-game
  && docker logs --follow Root-Board-Game-Container
```


The app is now available on your chosen port.

Local URL:    http://localhost: `<external-port>`

LAN/web URL:  See console output

#### To stop or restart the container:

```bash
docker stop Root-Board-Game-Container
```

or 

```bash
docker start Root-Board-Game-Container && docker logs --follow Root-Board-Game-Container
```


### Optional Alternative: put Caddy in front for host-IP access on ports 80/443

Use this when you want people on your LAN (or forwarded external traffic) to hit your host machine IP and have Caddy proxy to the game container.

First run:

```bash
docker build -t root-board-game .
```

1. Create a shared Docker network:

```bash
docker network create root-net
```

2. Run the game container on that network (no published app port needed):

```bash
docker run -d
  --name Root-Board-Game-Container
  --network root-net
  --network-alias root
  -e EXTERNAL_SCHEME=https
  -e EXTERNAL_PORT=443
  -e DEVICE_IP=<host-ip>
  -e ADMIN_PASSWORD=<admin-secret>
  -e SITE_PASSWORD=<site-secret>
  root-board-game
```

3. Run Caddy on the same network and publish 80/443 on the host:

```bash
docker run -d
  --name Root-Caddy
  --network root-net
  -p 80:80
  -p 443:443
  -e CADDY_HOST=<host-ip>
  -v "<repo-path>/caddy/Caddyfile:/etc/caddy/Caddyfile:ro"
  -v root-caddy-data:/data
  -v root-caddy-config:/config
  caddy:2-alpine
```

4. Verify logs:

```bash
docker logs --follow Root-Caddy
```

Notes:

- Set `<host-ip>` to the host computer's actual LAN IP (for example `192.168.1.50`).
- Set `<repo-path>` to your absolute local path to this repo.
- Open firewall/NAT for TCP 80 and 443 to the host machine if needed.
- HTTPS here uses Caddy local certs (`tls internal`), so other devices may need to trust Caddy's local CA to avoid certificate warnings.

### Hosted without Docker

```bash
npm run build
```

Then:

```bash
npm run server
```

Hot reload and multi-room server are now available on port `8787`.

Local URL:    http://localhost:8787/

LAN/web URL:  See console output

## Multiplayer

1. Visit the homepage → **Create game**. A 6-character room code is allocated and the URL updates to `/r/<code>`.
2. Share the link if formatting is correct. Others can click it or paste the code into **Join a game**.
3. When creating the room, choose whether unclaimed seats should be auto-filled with bots. If bot fill is off, the empty seats stay empty.
4. The server validates every action against the player's seat and broadcasts state to all clients.

If a player closes the tab in a bot-filled room, their seat is freed and the AI takes over. If bot fill is off, the seat stays empty instead. Players can rejoin from the same URL and reclaim any free seat.

## Card art

The app fetches official card art from the Leder Games CDN at runtime. To cache all images locally (removes the CDN dependency):

```bash
npm run download-assets
```

This downloads all 65 card `.webp` files into `src/assets/raw/cards/`. The asset loader checks that directory first, so the CDN is no longer needed once the files are present. Re-running the command skips files that already exist. The `raw/` folder is gitignored — files stay local and are never committed.

### Custom art/assets

Custom art may be uploaded from the browser as a ZIP file where it will be stored locally in that browser only. The server never receives the images. Click **Upload custom assets ZIP** on the startup page, then upload a ZIP that contains your `raw/` folder.

The ZIP uses the following file structure:

```
raw/
├── board/autumn.png
├── cards/<card-slug>.png        e.g. ambush-fox.png, travel-gear-mouse.png
├── factions/<faction>/icon.png · warrior.png · <building>.png
├── tokens/wood.png              optional custom wood token art
├── items/<item>.png             sword, hammer, crossbow, boots, bag, tea, coin, torch
└── dominance/<suit>.png
```

Card filenames are lowercase-kebab slugs of the card name (punctuation stripped, spaces → `-`).

Run `node scripts/list-asset-names.mjs` to print every expected filename.

ZIP the folder first, then upload the ZIP. Loose files are not accepted.

## Admin

Set `ADMIN_PASSWORD` in `.env` to enable `/admin`. Without it, all server routes return `503`.

The admin password is bypassed when using the Vite connection for local development and testing. 

Vite starts when you run `npm run dev` or `npm run host`. The server entry points, which start when you run `npm run host` or `npm run server`, still require a valid admin password, and if `ADMIN_PASSWORD` is unset they stay disabled and return error `503`.

The admin page lists every room with timestamps and player state, and lets you delete rooms or run a stale-room prune.

```bash
echo 'ADMIN_PASSWORD=your-secret' >> .env
```

## Site-wide Password Protection

If you want to lock the whole site behind a non-admin password, set `SITE_PASSWORD` in `.env`. The startup page will prompt for it, then remember the browser with a local session cookie.

```bash
echo 'SITE_PASSWORD=your-secret' >> .env
```

## Scripts

| Command                   | What it does                                                        |
| ------------------------- | ------------------------------------------------------------------- |
| `npm run dev`             | Vite dev server, single-player local                                |
| `npm run host`            | Vite + multi-room WS server (two ports)                             |
| `npm run server`          | Multi-room server only (serves `./dist`)                            |
| `npm run build`           | Production bundle into `dist/`                                      |
| `npm test`                | Vitest test suite                                                   |
| `npm run typecheck`       | `tsc -b --noEmit`                                                   |
| `npm run download-assets` | Download all card art from CDN into `src/assets/raw/cards/`         |
| `npm run release`         | Build multi-arch Docker image and push `:VERSION` + `:latest`       |
| `npm run prune-stale`     | One-shot stale-room cleanup (`--days N`, `--dry-run`)               |

## Release

Bump `"version"` in `package.json`, then:

```bash
npm run release
```

Builds a multi-arch (`linux/amd64` + `linux/arm64`) image, tags it with the version number and `latest`, and pushes both to `docker.kepi.site`. Deploy on the server with:

```bash
docker compose pull && docker compose up -d
```

## Environment variables

Copy `.env.example` to `.env` and edit. `docker compose` and the dev scripts both read `.env` automatically.

### Server

| Variable            | Default        | Purpose                                              |
| ------------------- | -------------- | ---------------------------------------------------- |
| `PORT`              | `8787`         | HTTP + WebSocket port                                |
| `DIST_DIR`          | `./dist`       | Where to serve the React bundle from                 |
| `DATA_DIR`          | `./data/rooms` | Where to write per-room JSON files                   |
| `MAX_ROOM_AGE_DAYS` | `90`           | Rooms idle longer than this are auto-pruned          |
| `ADMIN_PASSWORD`    | _unset_        | Enables `/admin`. Unset → admin disabled (503)       |
| `SITE_PASSWORD`     | _unset_        | Locks the whole site behind a password. Browser session remembers login via a browser cookie. |

### Datadog Telemetry (optional)

Telemetry is off by default. Set `DD_TRACE_ENABLED=true` and run a [Datadog Agent](https://docs.datadoghq.com/agent/) to enable APM traces and custom metrics.

In the Docker Compose setup, `DD_AGENT_HOST` is hardcoded to `host.docker.internal` (with `extra_hosts: host-gateway` for Linux) so the container always reaches the agent on the Docker host. The other variables default via shell substitution in `docker-compose.yml` and can be overridden in `.env`.

| Variable              | Compose default       | Purpose                                           |
| --------------------- | --------------------- | ------------------------------------------------- |
| `DD_TRACE_ENABLED`    | `true`                | Set to `false` to disable. Any non-`true` → off   |
| `DD_AGENT_HOST`       | `host.docker.internal`| Hostname of the Datadog Agent                     |
| `DD_TRACE_AGENT_PORT` | `8126`                | APM trace port on the agent                       |
| `DD_SITE`             | `datadoghq.com`       | Datadog intake site                               |
| `DD_SERVICE`          | `root-game`           | Service name shown in Datadog                     |
| `DD_ENV`              | `home`                | Environment tag (`production`, `staging`, …)      |
| `DD_VERSION`          | _unset_               | Version tag, e.g. `1.0.0`                         |

**Custom metrics emitted:**

| Metric                  | Type      | Tags                              |
| ----------------------- | --------- | --------------------------------- |
| `root.room.created`     | count     | —                                 |
| `root.room.deleted`     | count     | —                                 |
| `root.room.pruned`      | count     | `count:N`                         |
| `root.game.started`     | count     | `factions:<order>`                |
| `root.game.over`        | count     | `winner:<faction>`, `via:<reason>`|
| `root.action.applied`   | count     | `kind:<faction_action>`           |
| `root.ws.connected`     | count     | —                                 |
| `root.ws.disconnected`  | count     | —                                 |
| `root.bot.turn_ms`      | histogram | —                                 |
| `root.rooms.active`     | gauge     | — (reported every 30 s)           |
| `root.players.online`   | gauge     | — (reported every 30 s)           |

HTTP requests are traced automatically via dd-trace auto-instrumentation (no manual spans required).

## License

The code in this repository is open-source. The game itself, rules, and any artwork are © Leder Games. This project is for personal use; deploy publicly with non-official art only.
