<p align="center">
  <img src="./public/icon-512.png" width="128" alt="Lasai app icon" />
</p>

<h1 align="center">Lasai</h1>

<p align="center">
  A free, offline, ad-free space to calm down and breathe for a few minutes — everything stays on your device.
</p>

<p align="center">
  <a href="https://endika.github.io/Lasai/"><b>Try it now →</b></a>
</p>

<p align="center">
  <a href="https://github.com/Endika/Lasai/releases/latest"><img src="https://img.shields.io/github/v/release/Endika/Lasai?style=flat-square&color=2c8c85&label=release" alt="Latest release" /></a>
  <a href="https://github.com/Endika/Lasai/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Endika/Lasai/ci.yml?style=flat-square&label=ci&branch=main" alt="CI" /></a>
  <a href="https://github.com/Endika/Lasai/commits/main"><img src="https://img.shields.io/github/last-commit/Endika/Lasai?style=flat-square" alt="Last commit" /></a>
  <a href="https://www.conventionalcommits.org"><img src="https://img.shields.io/badge/conventional_commits-1.0.0-FE5196?style=flat-square" alt="Conventional Commits" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/Endika/Lasai?style=flat-square&color=10B981" alt="License: MIT" /></a>
</p>

Lasai is a free, offline, ad-free stress-calming and breathing companion. Open it,
breathe, and feel calmer — everything stays on your device. There is no account, no
tracking, and no backend: nothing you do ever leaves your phone.

## Features

- **Measure my pulse (experimental):** an on-device camera reading that estimates
  your heart rate, and a rough HRV-based stress band only when the signal is clean
  enough. Frames are processed on your device and never stored or sent. It is not a
  medical device and makes no medical claims.

## Tech

- React 19 + Vite + TypeScript (strict)
- Tailwind CSS v4
- Installable PWA (works fully offline)
- i18next (English and Spanish to start)
- Hexagonal architecture (`domain` / `application` / `infrastructure` / `presentation`)

## Development

```bash
npm install        # install dependencies
npm run dev        # start the dev server
npm run build      # type-check and build for production
npm run preview    # preview the production build
```

Quality gates:

```bash
npm run lint        # ESLint (zero warnings)
npm run type:check  # TypeScript
npm run test:run    # Vitest
npm run format      # Prettier (write)
```

Regenerate the placeholder PWA icons:

```bash
npm run generate-icons
```

## License

[MIT](./LICENSE) © Endika Iglesias
