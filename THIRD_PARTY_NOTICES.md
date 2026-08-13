# Third-party notices

WhiteAesther is distributed with, and builds on, the software below. Each remains under its own
licence, and those licences are not superseded by WhiteAesther's.

## Aether

The connection engine. WhiteAesther ships the `aether` executable inside its installers and links
the `aether` crate for endpoint scanning.

- Upstream: <https://github.com/MatinSenPai/Aether>
- The build used here: <https://github.com/WhiteDNS/Aether> — a fork adding an embedded API, with
  upstream history preserved and every change reviewable as a diff against it
- Licence: GNU Affero General Public License v3.0 — see `LICENSE`
- Copyright: the Aether authors

Because WhiteAesther links Aether, WhiteAesther is itself a derivative work and is licensed
AGPL-3.0. Its complete source is public at <https://github.com/WhiteDNS/WhiteAesther>.

### Trademark

"Aether", the Aether logo and its branding are trademarks of CluvexStudio and the Aether project,
and are **not** covered by the AGPL-3.0 grant. Use of the name in the WhiteDNS fork is by written
permission from the Aether maintainers, conditional on that repository remaining public. See
`TRADEMARK.md` in the Aether repository.

WhiteAesther is not an official Aether product and is not endorsed by the Aether project. Problems
with WhiteAesther should be reported to WhiteDNS, not to the Aether maintainers.

## Cloudflare WARP

WhiteAesther connects to Cloudflare's WARP and MASQUE infrastructure using the protocols Aether
implements. It is not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. "Cloudflare"
and "WARP" are trademarks of Cloudflare, Inc.

## Bundled fonts

- **Inter** — SIL Open Font License 1.1, © The Inter Project Authors
- **IBM Plex Mono** — SIL Open Font License 1.1, © IBM Corp.

## Application dependencies

The Rust and JavaScript dependencies are recorded in `src-tauri/Cargo.lock` and `pnpm-lock.yaml`,
each under its own licence — predominantly MIT and Apache-2.0. Notable components include Tauri
(MIT/Apache-2.0), React (MIT), Radix UI (MIT), Tailwind CSS (MIT), shadcn/ui (MIT) and Lucide
(ISC).
