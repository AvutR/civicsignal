# CivicSignal

A working, browser-local prototype for exploring community infrastructure needs. Built with plain HTML, CSS, JavaScript modules, and Leaflet. No runtime build dependencies, API keys, paid services, or server are required.

## Run locally

Install Node.js 24 or later, then run:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4174. On Windows PowerShell with restricted script execution, use `npm.cmd` in place of `npm`. Serve over HTTP; do not open `index.html` directly because it uses JavaScript modules.

## Try the prototype

1. Explore 12 clearly labelled sample reports. Category, time, search, and status filters update the map, list, and insight together. Overview cards summarize all stored reports.
2. Choose a sample city, click the map, use device location, or enter exact coordinates. City choices use city-centre coordinates; refine the pin for a precise report.
3. Add a report. It appears immediately and survives reloads in the same browser.
4. Select a request to read its details, find it on the map, or update its status.
5. Export matching reports as JSON. Reset demo requires confirmation and restores the sample set.

## Validation and build

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The build produces `dist/`, containing only public assets and the bundled map library. Data tests cover validation, combined filters and metric updates. Browser tests cover persistence, status updates, export, mobile layout, empty states, and failure of the external map library. To use an installed Chrome instead of downloading Chromium, set `PW_CHANNEL=chrome` when running browser tests.

## Free deployment: GitHub Pages

Use a public repository for GitHub Free. The included workflow runs tests, builds the static assets, and deploys them on pushes to `main`.

1. Push this project to a new public GitHub repository.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. Run **Test and deploy CivicSignal** from the Actions tab (or push another commit).
4. The deployment job links to `https://YOUR-ACCOUNT.github.io/YOUR-REPOSITORY/`.

All asset paths are relative, so repository subpaths work. No deployment secrets are needed; the workflow uses the repository's short-lived token. See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Alternatively, upload `dist/` to any static web host. Use HTTPS for device location support outside localhost.

## Scope and data

This is a functional single-browser demonstration, not a shared reporting service. Reports and review status changes are stored under `civicsignal.reports.v1` in localStorage. They are not sent to authorities or synchronized across visitors/devices. There is no authentication, official verification, notification system, remote API, or AI model. Insights are transparent counts from the filtered reports. Sample timestamps are relative to first load or reset. JSON export is available; import is not implemented.

Leaflet is bundled in `vendor/leaflet/` with its license. Map tiles load from OpenStreetMap and fonts from Google Fonts. These services receive normal web requests. Map library or tile failures leave reporting and the list usable; system fonts provide a typography fallback. Avoid sensitive personal data. Clearing browser storage deletes local reports. Storage failures are surfaced instead of falsely confirming a save.

Before using this for real civic operations, add a shared database and API, authenticated role-based review, abuse prevention, audit history, moderation, privacy/retention controls, and a production tile provider appropriate to traffic. Status editing in this demo is intentionally available to every visitor on their own device.

## Project layout

- `index.html`, `styles.css`: responsive interface and dialogs.
- `app.js`: map, forms, storage, filtering, and review workflows.
- `data.js`: sample data and reusable validation/filtering/statistics.
- `tests/`: data and browser regression checks.
- `scripts/`: dependency-free local server and static build.
- `.github/workflows/pages.yml`: tested deployment to GitHub Pages.
