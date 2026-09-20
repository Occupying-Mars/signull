# jev signal

a small chrome extension that marks likely-interesting x posts and youtube videos with `typesafe-ai/jev` through vercel ai gateway.

## install

load `extension/` as an unpacked extension at `chrome://extensions`. paste your own vercel ai gateway key, enter your preference, and click **mark this feed**.

you can also import a local `.env` containing `VERCEL_KEY=...`. visible items are classified in batches of six with up to three concurrent gateway requests.

the key is stored in `chrome.storage.local` (not synced) and is sent only to `https://ai-gateway.vercel.sh/v1/evaluate`. there is no shared backend or project-owned token. each user needs a vercel team with ai gateway access and a payment card on file, even while jev has free promotional pricing.
