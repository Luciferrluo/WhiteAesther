# WhiteAesther

Cross-platform desktop control surface for the Aether connection core.

## Working features

- Starts, monitors and stops a real Aether process from the Tauri backend
- Verifies the core executable and reports its exact version before connecting
- Exposes MASQUE H2, MASQUE H3, WireGuard and WARP-in-WARP profile controls
- Maps discovery, validation, fragmentation, reconnect, DNS, routing and Zero Trust settings to validated core arguments
- Streams real process logs and derives connection state, edge and latency from core events
- Persists profiles locally while keeping Access secrets and tokens memory-only
- Bundles a target-specific Aether sidecar in Windows, macOS and Linux packages

Automatic cross-transport failover and operating-system proxy integration remain roadmap items and are labeled as such in the UI.

## Development

Requirements: Node.js 22+, pnpm 10+, Rust 1.88 and the platform-specific Tauri prerequisites.

Place the Aether repository beside this repository, or set `AETHER_CORE_SOURCE` to an existing Aether executable. Then run:

```text
pnpm install
pnpm desktop:dev
```

The staging command verifies the executable with `aether --version` and copies it to Tauri's target-triple sidecar name. To create an installer:

```text
pnpm desktop:build
```

The desktop packaging workflow builds Aether and WhiteAesther together on Windows, macOS and Linux. Release builds are pinned to a reviewed Aether commit rather than a moving branch.

## Validation

```text
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

The Windows end-to-end smoke test also verifies core discovery, live state events, SOCKS5 exposure, a proxied request and clean shutdown.
