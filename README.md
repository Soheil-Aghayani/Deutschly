# Deutschly

Deutschly is a focused German flashcard PWA for Fatemeh’s Menschen A1.1 learning journey. It works in a desktop browser, on a phone, or as an installed app.

Live site: <https://soheil-aghayani.github.io/Deutschly/>

## What is included

- Adaptive review scheduling: recall first, reveal the answer, then rate it as Again, Hard, Good, or Easy.
- Menschen A1.1 starter cards plus personal cards for vocabulary, phrases, and grammar.
- German article colors: `der` blue, `die` feminine red, `das` green, and plural orange.
- Add-card verification that normalizes entries such as `Das Eis`, blocks exact duplicates, flags possible duplicates, and keeps reference links beside the check.
- Practice Lab drills for articles, plurals, translations, and sentence gaps, with German text-to-speech and optional self-recording.
- Lesson map, tags, weak-card filtering, editable cards, XP, levels, achievements, recall accuracy, and a seven-day activity view.
- Local Menschen PDF extraction. Selectable text is read in the browser and suggestions keep their source page and context. The PDF itself is never committed to this repository.
- Daily reminder time with browser notifications when permission is granted, one-hour snooze, and a downloadable recurring calendar event for reminders when the browser is closed.
- Responsive layout, installable PWA shell, light/dark themes, keyboard shortcuts, and local persistence.
- A private-room sync server for moving cards between a computer and a phone on the same Wi-Fi network.

## Use it

Open the live site above. To install it as an app:

- On Chrome or Edge desktop: use the install icon in the address bar or the browser menu.
- On Android: use the browser menu and choose **Install app** or **Add to Home screen**.
- On iPhone/iPad: use Safari’s **Share → Add to Home Screen**.

For reminders, open **Overview**, turn on **Smart reminder**, choose a review time, and allow notifications. Use **Calendar** in the reminder card to download a recurring `.ics` event; this is the reliable option when the browser is closed. Browser notifications still require the installed app or tab to be open.

## Run locally

```bash
npm install
npm run dev
```

The production checks are:

```bash
npm run typecheck
npm test -- --run
npm run build
```

## Sync phone and computer

On the computer, from the project folder, keep these two commands running:

```bash
npm run sync-server -- --host 0.0.0.0
npm run dev:network
```

Open the network URL printed by Vite on both devices. In Deutschly, open **Set up sync**, use `http://<PC-LAN-IP>:8787/api/sync` as the server URL, and enter the same room code on both devices. Turn on **Keep sync on automatically** if you want local changes to sync after a short pause. Keep both devices on the same private Wi-Fi network.

The sync server stores its room data in the ignored `.deutschly/sync.json` file on the computer. The static GitHub Pages site is shareable, but it does not host this private sync server. A production cloud sync service would still need HTTPS, authentication, encrypted storage, conflict history, and a hosted backend.

## GitHub Pages

`.github/workflows/deploy.yml` builds `dist` and deploys it to GitHub Pages whenever `main` is updated. The repository should have Pages configured with **GitHub Actions** as its build source.

The app is designed to keep Fatemeh’s cards in the browser by default. Use **Export backup** before moving data to a new browser, or use the private-room sync flow when both devices are available on the same network.
