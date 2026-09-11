<div align="center">
  <img src="public/readme-hero.svg" alt="Deutschly — German flashcards for Menschen A1.1" width="100%">
  <h1>DEUTSCHLY</h1>
  <p><strong>German that sticks — one focused review at a time.</strong></p>
  <p>
    <a href="https://soheil-aghayani.github.io/Deutschly/"><strong>Open the web app →</strong></a>
    ·
    <a href="https://github.com/Soheil-Aghayani/Deutschly/releases/latest"><strong>Download native builds →</strong></a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/React%20%7C%20TypeScript-Vite-5659C8?style=for-the-badge&logo=react&logoColor=white" alt="React TypeScript and Vite">
    <img src="https://img.shields.io/badge/PWA%20%7C%20Tauri-native-14977E?style=for-the-badge&logo=tauri&logoColor=white" alt="PWA and Tauri native builds">
    <img src="https://img.shields.io/github/actions/workflow/status/Soheil-Aghayani/Deutschly/deploy.yml?branch=main&style=for-the-badge&label=Pages" alt="GitHub Pages build status">
  </p>
</div>

Deutschly is a calm, adaptive German flashcard workspace for a **Menschen A1.1** learning journey. It is available as a web app, an installable PWA, and signed native builds for Windows, Linux, and Android.

## Choose your edition

| Edition | Best for | Network behavior |
| :--- | :--- | :--- |
| **Web** | Studying from any current browser | The public app is online-first. Core local cards remain in the browser, while AI, account sync, and new deployments need a connection. |
| **Windows / Linux** | A focused desktop workspace | The bundled app starts without the web site. Reviews, scheduling, progress, backups, and saved cards work offline. Optional AI depends on the provider you choose. |
| **Android APK** | Offline-first study on a phone | Install the APK from [GitHub Releases](https://github.com/Soheil-Aghayani/Deutschly/releases/latest). The core study loop is local; sync and hosted AI are optional. |

Native downloads are published on the [latest release page](https://github.com/Soheil-Aghayani/Deutschly/releases/latest): Windows installer, Linux AppImage/deb, Android APK, and an Android AAB for store distribution.

## The learning loop

| Step | What happens | Why it matters |
| :--- | :--- | :--- |
| **01 · Recall** | See the German word before the answer. | Retrieval is stronger than rereading. |
| **02 · Reveal** | Check meaning, example, pronunciation, and grammar. | Each card gets useful context. |
| **03 · Rate** | Choose **Again**, **Hard**, **Good**, or **Easy**. | Adaptive scheduling brings the right card back at the right time. |

## What is inside

- Adaptive reviews with keyboard controls, pronunciation, examples, XP, levels, and achievements.
- Practice drills for articles, plurals, translations, sentence gaps, and mixed recall.
- Personal cards, tags, search, weak-card filters, bulk actions, backups, and PDF source context.
- A checked A1/A2 word bank with article, plural, part-of-speech, meaning, example, and source metadata.
- Progress views for streaks, review activity, recall accuracy, daily goals, and milestones.
- Local persistence by default, optional Google/Firebase sync, reminders, themes, and a signed native updater.

## Offline data and updates

The native bundle contains the learning experience, so a user can review cards with no internet connection. Cards, progress, profile settings, and selected AI settings live in the app’s local data store. Export a JSON backup before moving devices or changing accounts.

Native builds check the signed GitHub release feed in the background. When a new version is ready, Deutschly shows an in-app notice and lets the user install it. The updater replaces the application bundle; it does not reset local cards or progress. Windows restarts after installation; Linux asks the user to relaunch. A Google/Firebase account can sync the learning state and AI configuration across devices when Firebase is configured for that deployment.

## AI that belongs to the learner

AI is optional. Open **Settings → AI & integrations** and choose one of these providers:

| Provider | What to configure | Offline? |
| :--- | :--- | :--- |
| **Off** | Nothing | Yes — core study and the checked word bank remain available. |
| **My Cloudflare Worker** | Your own Worker URL and optional access key | No, unless your Worker runs a local/available model. |
| **My Gemini API key** | Your Gemini key and model | No — the provider is remote. |
| **Ollama on this device** | Local Ollama URL and downloaded model, for example qwen2.5:3b | Yes, after the model is installed. |
| **Compatible bridge** | Any Deutschly-compatible bridge URL | Depends on that bridge. |

Keys are stored locally on the device and are not included in the public build. If Firebase account sync is enabled, the selected AI configuration can follow the signed-in user; use a Firebase project and security rules you control, and avoid storing a key on a shared machine.

For the private LAN bridge:

~~~powershell
$env:GEMINI_API_FILE = 'C:\path\to\Gemini API.txt'
npm run sync-server -- --host 0.0.0.0
~~~

For Ollama:

~~~powershell
$env:AI_PROVIDER = 'ollama'
$env:OLLAMA_MODEL = 'qwen2.5:3b'
ollama pull qwen2.5:3b
npm run sync-server -- --host 0.0.0.0
~~~

See cloudflare/README.md for the Worker deployment and tests.

## Minimum supported baseline

These are the tested baselines for the downloadable builds:

- **Windows:** Windows 10 1803 or newer, x64, with Microsoft WebView2 Evergreen installed or installable.
- **Linux:** x86_64 distribution with WebKitGTK 4.1; Ubuntu 22.04+ and Debian 12+ are the supported baseline. AppImage may need FUSE or --appimage-extract-and-run.
- **Android:** Android 7.0 / API 24 or newer. Use the APK for direct installation; the AAB is for a store pipeline.
- **Web:** Current Chrome, Edge, Firefox, or Safari. Network access is required for the hosted site, account sync, remote AI, and deployments.

## Run locally

~~~bash
git clone https://github.com/Soheil-Aghayani/Deutschly.git
cd Deutschly
npm install
npm run dev
~~~

For a native desktop development window, install Rust and the platform WebView dependencies, then run:

~~~bash
npm run native:dev
~~~

Before opening a pull request or publishing a change:

~~~bash
npm run typecheck
npm test -- --run
npm run test:worker
npm run build
~~~

## Private sync over Wi-Fi

Run both commands on the computer:

~~~bash
npm run sync-server -- --host 0.0.0.0
npm run dev:network
~~~

Open the network URL on both devices. In Deutschly, open **Set up sync**, use http://<PC-LAN-IP>:8787/api/sync, and enter the same room code. Keep this flow on a trusted network; the starter room server is not intended for public internet use without HTTPS and authentication.

## Project map

~~~text
Deutschly/
├─ src/                    # React application, settings, learning UI, and styles
│  ├─ data/                # Lessons, generated word bank, and content metadata
│  └─ lib/                 # Learning, sync, PDF, AI, Firebase, and persistence helpers
├─ public/                 # PWA shell, icons, achievement art, and README hero
├─ src-tauri/              # Windows/Linux/Android native shell and signed updater config
├─ cloudflare/             # Optional Cloudflare AI bridge and worker tests
├─ server.mjs              # Private LAN sync and local AI bridge
└─ .github/workflows/      # Pages deployment and native release pipeline
~~~

<details>
<summary><strong>Optional Firebase account sync</strong></summary>

Create a Firebase project with Google Authentication and Firestore, copy .env.example to .env.local, and fill the VITE_FIREBASE_* values. Publish firestore.rules, add the deployed Pages domain and localhost to Firebase authorized domains, and add the same values as repository variables for GitHub Actions. Without Firebase, Deutschly stays local and the private-room flow remains available.

</details>

<details>
<summary><strong>Import vocabulary from a Menschen PDF</strong></summary>

The source-aware importer verifies selected words on their declared PDF pages and skips entries that cannot be found or already exist:

~~~powershell
npm run menschen:agent -- --pdf 'C:\path\to\Menschen A1.1 Kursbuch OCR neu.pdf' --server-url 'http://127.0.0.1:8787' --limit 16
~~~

The source PDF is never committed to the repository.

</details>

## Deployment and releases

.github/workflows/deploy.yml publishes the web edition to [GitHub Pages](https://soheil-aghayani.github.io/Deutschly/). .github/workflows/native-release.yml builds signed Windows and Linux bundles, then adds Android APK/AAB artifacts to the same GitHub Release when a native-v* tag is pushed. The updater key stays in GitHub Actions secrets; only the public key is shipped in the app.

<div align="center">
  <sub>Built for small steps, clear progress, and German that stays with you.</sub>
</div>
