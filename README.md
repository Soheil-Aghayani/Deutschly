# Deutschly

Deutschly is a focused German flashcard PWA for Fatemeh’s Menschen A1.1 learning journey. It works in a desktop browser, on a phone, or as an installed app.

Live site: <https://soheil-aghayani.github.io/Deutschly/>

## What is included

- Adaptive review scheduling: recall first, reveal the answer, then rate it as Again, Hard, Good, or Easy.
- Menschen A1.1 starter cards plus personal cards for vocabulary, phrases, and grammar.
- German article colors: `der` blue, `die` feminine red, `das` green, and plural orange.
- Add-card verification that normalizes entries such as `Das Eis`, blocks exact duplicates, flags possible duplicates, and keeps reference links beside the check. The Gemini word bank is searchable in Library and can prefill a checked card with its meaning, article, plural, example, and tags.
- Practice Lab drills for articles, plurals, translations, and sentence gaps, with German text-to-speech and optional self-recording.
- Lesson map, tags, weak-card filtering, editable cards, XP, levels, achievements, recall accuracy, and a seven-day activity view.
- Local Menschen PDF extraction. Selectable text is read in the browser and suggestions keep their source page and context. The PDF itself is never committed to this repository.
- Daily reminder time with browser notifications when permission is granted, a snooze that moves the next alert to the following clock hour, and a downloadable recurring calendar event for reminders when the browser is closed.
- Responsive layout, installable PWA shell, light/dark themes, keyboard shortcuts, and local persistence.
- A private-room sync server for moving cards between a computer and a phone on the same Wi-Fi network.
- A generated, typed German word database for A1 and A2 word-bank curation, with English meanings, articles, plurals, examples, and learner tags.

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

## Optional Gemini card review

The **Ask Gemini** action in the card checker is an optional assistant for uncertain articles, plurals, meanings, and duplicate clues. The local duplicate checker remains the source of truth, and Gemini suggestions are never saved automatically.

Keep the Gemini key on the PC that runs the local server. Either set `GEMINI_API_KEY`, or point `GEMINI_API_FILE` at a local text file containing the key. Do not add the key to the repository, browser code, or a public API relay:

```powershell
$env:GEMINI_API_FILE = 'C:\path\to\Gemini API.txt'
npm run sync-server -- --host 0.0.0.0
```

If the sync URL is configured in Deutschly, the app uses the same private server for card review. On the phone, use the PC LAN address in the sync settings. Stop the server when you are finished, and keep it on a trusted Wi-Fi network; this starter bridge is intentionally not a public production service.

The same private bridge exposes `POST /api/gemini/word-batch` for an A1 or A2 curation pass. It validates the level, removes duplicate headwords, and returns structured records without sources or URLs. Generated words are written only after the agent validates their shape and deduplicates them against the local database.

To add reviewed Gemini batches to the local database, run the bounded word agent from the project folder. It reads the key from the file, compares every batch with existing headwords, and writes only new records to `src/data/germanWords.generated.json`:

```powershell
npm run words:agent -- --key-file 'C:\path\to\Gemini API.txt' --levels A1,A2 --count 20 --batches 1
```

When the private sync server is already running with its Gemini key configured, the agent can reuse it without reading a key file directly:

```powershell
npm run words:agent -- --server-url 'http://127.0.0.1:8787' --levels A1,A2 --count 20 --batches 1
```

The `--legacy-review-fallback` option is available for an already-running older bridge that has card review but not the word-batch endpoint. It verifies a small built-in learner list through the existing review route, then stores the validated records. Restart the bridge from the current project version before using larger generated batches.

Use a small, explicit batch count when adding more words. The agent never runs an unbounded loop, never stores the API key, and keeps the local database as the source of truth.

## GitHub Pages

`.github/workflows/deploy.yml` builds `dist` and deploys it to GitHub Pages whenever `main` is updated. The repository should have Pages configured with **GitHub Actions** as its build source.

The app is designed to keep Fatemeh’s cards in the browser by default. Use **Export backup** before moving data to a new browser, or use the private-room sync flow when both devices are available on the same network.
