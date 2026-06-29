# 3D Avatar (Aria) for AP Discovery Live — cute anime girl + lip sync

Aria now uses a **VRM** avatar — the free, open standard used for cute
VTuber-style anime girls (built with [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm)).
VRM models include facial expression presets (`aa` = open mouth, `blink`,
`happy`, ...) which the app drives in real time:

- **Lip sync** — her mouth opens with Aria's actual voice amplitude (tapped from
  the live audio).
- **Auto blink + soft smile + gentle idle head sway.**

She's on the **left**, the chat transcript + mic/end controls on the **right**,
with a status pill (“Aria is speaking / listening / paused”) under her.

## ⭐ One step to get the cute avatar (≈ 30 seconds)

The earlier “Failed to fetch / ERR_NAME_NOT_RESOLVED” happened because your
network couldn't reach the external avatar host. The fix: load the model from a
**local file** in the app, so it can never be blocked.

1. Download a free cute girl `.vrm` from any of these:
   - **VRoid Hub** — <https://hub.vroid.com> (open a free/downloadable character
     → Download → `.vrm`)
   - **Open Source Avatars** — <https://www.opensourceavatars.com> (CC0 / free)
   - **Make your own** — <https://vroid.com/en/studio> (free app, export `.vrm`)
2. Rename it to **`aria.vrm`**.
3. Put it here: **`frontend/public/avatars/aria.vrm`**
4. `npm install` (first time only) then `npm run dev`, and start an AP Discovery
   Live session. Aria appears in 3D and lip-syncs while she speaks.

Until you add the file, you'll see a soft pink **kawaii placeholder** (not the
scary blob from before) that still blinks and lip-syncs.

### Alternative: load from a URL
If you'd rather not keep a local file, set this in `frontend/.env` and restart:
```
VITE_AVATAR_URL=https://your-host.example.com/your-avatar.vrm
```
(Use a host your network can actually reach.)

## Install & run

```bash
cd frontend
npm install     # adds three + @pixiv/three-vrm + @react-three/fiber
npm run dev
```

## Files

- `frontend/src/components/Avatar3D.jsx` — VRM loader + lip-sync/blink/idle
  animation + the kawaii fallback.
- `frontend/src/components/LiveChat.jsx` — two-column layout + analyser tap in
  the audio pipeline, lazy-loads the 3D bundle when connected.
- `frontend/public/avatars/` — drop `aria.vrm` here.
- `frontend/package.json` — adds `three`, `@pixiv/three-vrm`, `@react-three/fiber`.

## Performance

- Pixel ratio capped (`dpr=[1, 1.5]`), 3D bundle lazy-loaded only when connected,
  single character — smooth on typical laptops/phones.
