# Impromptu

A browser app for impromptu speaking practice.

Choose from 1,000 topics across everyday life, work, society, abstract ideas,
science, technology, and history. Prepare notes, practise with a timer, and
record a speech with your microphone. Review or download recordings from
the practice history. Light and dark themes are available.

Notes and recordings stay in the current browser. Clearing browser data
removes them. Download recordings you want to keep.

## Run locally

Install Node.js and npm. From the project folder, run:

```sh
npm ci
npm run build
```

Serve `dist/` with a static HTTP server. Open its URL in a browser.
Rebuild after changing files in `src/` or `public/`.

For example, with Python 3 installed:

```sh
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Microphone recording needs browser permission
and HTTPS or localhost. Timer-only practice works without a microphone.

## Verify

```sh
npm test
```

Source files are in `src/`. Static assets are in `public/`.
Build output is excluded from Git.
