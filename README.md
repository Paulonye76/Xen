# AirXender 📡

**AirDrop for every device** — a simple, beautiful peer-to-peer file sharing web app inspired by Apple’s AirDrop and Xender.

## Features

- ✅ Works on **Android, iOS, Windows, macOS, Linux** (any modern browser)
- ✅ **Peer-to-peer** transfers (WebRTC) — files never touch a server
- ✅ No accounts, no installation required
- ✅ Drag & drop or file picker
- ✅ Progress bars & multi-file support
- ✅ Direct Peer ID connection + Room codes
- ✅ Installable as a Progressive Web App (PWA)
- ✅ Clean dark UI

## How to use (quick)

1. Open `index.html` on **two devices** (or host the folder anywhere).
2. On Device A → copy the **Your ID** shown at the top.
3. On Device B → paste that ID in the **“Connect Directly”** box and click **Connect**.
4. Once connected, drag files onto the drop zone or click **Send File** next to the device.

> Best speed: both devices on the **same Wi-Fi** network.

## Run locally (no install)

```bash
# Option A – just open the file
# Double-click index.html (some browsers may restrict local WebRTC)

# Option B – recommended (tiny local server)
npx serve .
# then open the URL it shows (usually http://localhost:3000)
```

## Deploy yourself (free)

### Vercel (easiest)
```bash
npx vercel
```

### Any static host
Upload the four files:
- `index.html`
- `styles.css`
- `app.js`
- `manifest.json`

## Privacy

- Only connection signaling goes through the free PeerJS cloud
- Actual file data travels **directly** between your browsers (encrypted WebRTC DataChannels)
- No files are ever stored on any server

## Tech Stack

- Vanilla HTML / CSS / JavaScript
- PeerJS (WebRTC + free public signaling)
- PWA-ready

---

Made with ❤️ as an open alternative to AirDrop & Xender.
