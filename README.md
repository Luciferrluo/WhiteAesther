# WhiteAesther

Cross-platform desktop control surface for the Aether connection core.

## Working features

- Starts, monitors and stops a real Aether process from the Tauri backend
- Verifies the core executable and reports its exact version before connecting
- Exposes MASQUE H2, MASQUE H3, WireGuard and WARP-in-WARP profile controls
- Maps discovery, validation, fragmentation, reconnect, DNS, routing and Zero Trust settings to validated core arguments
- Streams real process logs and derives connection state, edge and latency from core events
- Retries a failed core on a widening delay, up to eight attempts, and reports which attempt it is on
- Alternates MASQUE H2 and H3 across those retries, so a network that blocks UDP does not fail eight times over QUIC
- Pins a specific endpoint with a choice of falling back to discovery when it fails, or reporting the failure rather than silently substituting
- Builds a reviewable diagnostics report that redacts addresses by default and carries no Zero Trust credentials
- Persists profiles locally while keeping Access secrets and tokens memory-only
- Bundles a target-specific Aether sidecar in Windows, macOS and Linux packages

Operating-system proxy integration and a full-device tunnel remain roadmap items and are labeled as such in the UI.

## Development

Requirements: Node.js 24+, pnpm 10+, Rust 1.88 and the platform-specific Tauri prerequisites. The unit tests are TypeScript run directly on Node's test runner, which needs 22.18 or newer for type stripping; 24 is what CI uses.

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
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

`pnpm test` runs the frontend unit tests on Node's own test runner, with no test framework installed. It covers the diagnostics report, including that redaction removes every address form the core actually logs and leaves timestamps alone.

The Windows end-to-end smoke test also verifies core discovery, live state events, SOCKS5 exposure, a proxied request and clean shutdown.
