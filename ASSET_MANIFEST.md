# Asset Manifest

This project ships as an original Wallpaper Engine web wallpaper named Pond Patrol.

## Generated Project Assets

The PNG sprites, UI images, favicon, and WAV sound effects under
`public/images/` and `public/audio/` are original assets made for this project.
They can be regenerated with:

```powershell
npm.cmd run assets:original
```

The generation script is `scripts/generate-original-assets.mjs`. It draws the
pixel-art scene and sprites with Node.js buffers and synthesizes the WAV effects
with simple waveforms/noise.

`public/wallpaper/preview.jpg` is a local preview image captured from the
original Pond Patrol wallpaper bundle.

## Third-Party Runtime Packages

The wallpaper bundles local web fonts through npm packages:

- `@fontsource/press-start-2p`
- `@fontsource/teko`

Those packages and all build tooling retain their upstream package licenses in
`node_modules/` and `package-lock.json`.

## Generated Build Output

`build/` is the ready-to-import Wallpaper Engine bundle produced by:

```powershell
npm.cmd run build
```

It contains generated JavaScript/CSS chunks, copied metadata, copied local fonts,
and copied original image/audio assets.

## Publishing Boundary

Pond Patrol is a retro target-shooter homage. It does not include third-party
characters, logos, recordings, ripped sprites, or publisher branding. Keep that
boundary intact before publishing modified versions to Steam Workshop or another
public marketplace.
