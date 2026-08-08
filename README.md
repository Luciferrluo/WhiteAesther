# WhiteAesther

Cross-platform desktop control surface for the Aether connection core.

## Current phase

- Tauri 2 shell for Windows, macOS and Linux
- React 19 and TypeScript UI
- Approved Overview and Connection Lab design
- Typed mapping from desktop profiles to Aether CLI arguments
- Local-only profile persistence
- Rust runtime bridge with restricted Tauri capabilities

Transport supervision and managed core-process integration are the next implementation slices. Controls marked `ROADMAP` are intentionally not presented as existing core behavior.

## Development

Requirements: Node.js, pnpm, Rust and the platform-specific Tauri prerequisites.

```text
pnpm install
pnpm build
pnpm tauri dev
```

The desktop application will consume the Aether core as a managed sidecar. Core source and identity material are not stored in this repository.
