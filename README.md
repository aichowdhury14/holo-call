# HoloCall (prototype)

See people and products in your own space from any phone: on-device AI cuts the subject out,
gives it some depth, and places it in a virtual room, over your camera, or life-size on your real floor.

## Tabs (use cases)
| Tab | What it does | Who needs a camera |
|---|---|---|
| Call | One-to-one hologram video call with mute, camera off, front/back camera and mic meter, plus a solo preview | Both people |
| Shop | Real-size products in a Bangladeshi room: smart TV (Netflix/YouTube/Live TV screens, play your own video), fridge with opening doors, ceiling fan, split AC, steel almirah, wooden sofa, khat with mosquito net, gas stove. Or any product photo, cut out by tapping it | Nobody (back camera only for AR) |
| Live | Live selling: presenter shows a product card (name, price, WhatsApp/link to order), viewers send hearts | Presenter only |
| Class | Teacher pins notes to a board, students raise hands | Teacher only |
| Stage | Speaker under a spotlight with a name caption; venue screen uses Display mode; audience sends applause | Speaker only |
| About | How it works, limits, and how to scale it | - |

The TV's app screens are a simulation with sample programmes: real Netflix or YouTube can't play inside
another website. "My video" plays any real video file from the device.

Every session has: Room / Camera AR / Place in room (WebXR) views, Hologram / Real style, Tilt to look,
and Glasses 3D (side-by-side for Cardboard or Xreal/Rokid display glasses).

## Code
Static files, no build step.
- `js/stage.js` 3D scene, projector and product display, views, glasses, tilt, WebXR
- `js/segment.js` MediaPipe: selfie segmenter (video) and magic-touch segmenter (tap-to-cut photos)
- `js/catalog.js` the real-size product models and their controls
- `js/smarttv.js` the TV's on-screen system (home, apps, live channels, your own video)
- `js/home.js`, `js/textures.js` the room and procedural textures
- `js/media.js` camera, microphone, mute, camera switch, mic meter
- `js/products.js` the photo cutout pipeline
- `js/net.js` PeerJS: one-to-one calls and one-to-many broadcasts (max 12 viewers)
- `js/app.js` tabs, sessions and UI
- `vendor/` three.js 0.160.0, MediaPipe Tasks Vision 0.10.21 + models, PeerJS 1.5.4

## Run locally
```
python -m http.server 8765
```
Open http://localhost:8765. Phones need https for the camera, so test them against the Vercel deployment.

## Scaling beyond the prototype
- Broadcasts are peer-to-peer: the presenter uploads one stream per viewer, so 12 is the cap.
  For hundreds or thousands, route video through an SFU (LiveKit Cloud, Cloudflare Calls).
- Signalling and TURN use PeerJS's free public servers. Run your own PeerServer and a TURN
  service (coturn, Cloudflare, Metered) for reliability.
- One camera gives 2.5D. True 3D needs multiple cameras or a depth sensor.
