# Lasai

Lasai is a free, offline, ad-free stress-calming and breathing companion.
Open it, breathe, and feel calmer — everything stays on your device. There is
no account, no tracking, and no backend: nothing you do ever leaves your phone.

## Features

This is an early skeleton. The breathing and calming experiences are on the way.

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
