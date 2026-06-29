Put your cute girl avatar here as:  aria.vrm

(That is: frontend/public/avatars/aria.vrm)

The AP Discovery Live screen loads /avatars/aria.vrm automatically. Because it
loads from your own app origin, it works even if external avatar hosts are
blocked on your network.

Where to get a FREE cute anime-girl .vrm (pick one, ~30 seconds):

  1. VRoid Hub        https://hub.vroid.com   (filter by "Free" / downloadable;
                       open a character -> Download -> .vrm)
  2. Open Source Avatars  https://www.opensourceavatars.com  (CC0 / CC-BY, free)
  3. Make your own    https://vroid.com/en/studio  (free app; export .vrm)

Then rename the downloaded file to  aria.vrm  and drop it in this folder.
Restart `npm run dev` (or just refresh) and Aria appears in 3D with lip sync.

Advanced: instead of a local file you can point to any .vrm URL by setting
VITE_AVATAR_URL in frontend/.env
