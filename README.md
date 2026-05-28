# Root

A web implementation of the asymmetric woodland board game *Root*, played solo against AI opponents or with friends through a hosted website anyone can create or join games on.

## Quick start

### Solo (local)

```bash
npm install
npm run dev
```

Open <http://localhost:5173>, pick a faction, and play.

### Hosted (Docker)

```bash
docker compose pull && docker compose up -d
```

Pulls the pre-built image from `docker.kepi.site` and starts the server on **port 8787**. Room data persists to a Docker volume and survives container rebuilds.

### Hosted (development, no Docker)

```bash
npm run host
```

Starts Vite on `:5173` with hot reload and the multi-room server on `:8787`.

## Multiplayer

1. Visit the homepage → **Create game**. A 6-character room code is allocated and the URL updates to `/r/<code>`.
2. Share the link. Others click it or paste the code into **Join a game**.
3. Each player claims a faction seat. Unclaimed seats become AI bots when the game starts.
4. The server validates every action against the player's seat and broadcasts state to all clients.

If a player closes the tab their seat is freed and the AI takes over. They can rejoin from the same URL and reclaim any free seat.

## Card art

The app fetches official card art from the Leder Games CDN at runtime. To cache all images locally (removes the CDN dependency):

```bash
npm run download-assets
```

This downloads all 65 card `.webp` files into `src/assets/raw/cards/`. The asset loader checks that directory first, so the CDN is no longer needed once the files are present. Re-running the command skips files that already exist. The `raw/` folder is gitignored — files stay local and are never committed.

### Custom art

To use your own scans, drop files into `src/assets/raw/`. The loader prefers them over the built-ins on a per-file basis:

```
src/assets/raw/
├── board/autumn.png
├── cards/<card-slug>.png        e.g. ambush-fox.png, travel-gear-mouse.png
├── factions/<faction>/icon.png · warrior.png · <building>.png
├── items/<item>.png             sword, hammer, crossbow, boots, bag, tea, coin, torch
└── dominance/<suit>.png
```

Card filenames are lowercase-kebab slugs of the card name (punctuation stripped, spaces → `-`). Run `node scripts/list-asset-names.mjs` to print every expected filename.

## Admin

Set `ADMIN_PASSWORD` in `.env` to enable `/admin`. Without it, all admin routes return `503`.

```bash
echo 'ADMIN_PASSWORD=your-secret' >> .env
```

The admin page lists every room with timestamps and player state, and lets you delete rooms or run a stale-room prune.

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

| Variable            | Default        | Purpose                                              |
| ------------------- | -------------- | ---------------------------------------------------- |
| `PORT`              | `8787`         | HTTP + WebSocket port                                |
| `DIST_DIR`          | `./dist`       | Where to serve the React bundle from                 |
| `DATA_DIR`          | `./data/rooms` | Where to write per-room JSON files                   |
| `MAX_ROOM_AGE_DAYS` | `90`           | Rooms idle longer than this are auto-pruned          |
| `ADMIN_PASSWORD`    | _unset_        | Enables `/admin`. Unset → admin disabled (503)       |

## License

The code in this repository is mine. The game itself, rules, and any artwork are © Leder Games. This project is for personal use; deploy publicly with original art only.
