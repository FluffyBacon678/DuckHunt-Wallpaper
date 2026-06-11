# Steam Workshop Publishing Guide

Use this guide for publishing Pond Patrol Wallpaper as a Wallpaper Engine web
wallpaper on Steam Workshop.

## Build The Upload Package

```powershell
npm.cmd install --legacy-peer-deps
npm.cmd run verify:release
```

The upload package is written to:

```text
dist/pond-patrol-wallpaper.zip
```

The ZIP contains the Wallpaper Engine files at the archive root, including
`index.html`, `project.json`, `preview.jpg`, `js/`, `images/`, `audio/`, and
`fonts/`.

## Suggested Listing

Title:

```text
Pond Patrol Wallpaper
```

Short description:

```text
An original retro pond target-shooter web wallpaper with mouse-playable canvas gameplay and Wallpaper Engine customization.
```

Long description:

```text
Pond Patrol is an original retro target-shooter wallpaper built for Wallpaper Engine.

Features:
- Mouse-playable HTML5 Canvas gameplay
- Responsive desktop scaling with contain, cover, and stretch modes
- Local pixel-art sprites, pond background, UI, fonts, and synthesized sound effects
- Customizable volume, mute, cursor, HUD, controls, interaction, autostart, and bird speed
- Wallpaper Engine pause/resume and FPS support

Asset note:
The included art, UI, preview, and sound effects were made for this project. Pond Patrol is a retro homage and does not include third-party characters, logos, recordings, ripped sprites, or publisher branding.
```

Suggested tags:

```text
Game
Pixel Art
Retro
Interactive
Arcade
```

## Manual Upload Checklist

- Run `npm.cmd run verify:release`.
- Confirm `dist/pond-patrol-wallpaper.zip` was generated.
- In Wallpaper Engine, create or import a web wallpaper from `build/index.html`.
- Confirm Wallpaper Engine reads `build/project.json`.
- Confirm the preview image is `build/preview.jpg`.
- Confirm the visible title is `Pond Patrol`.
- Confirm the user properties appear and apply correctly.
- Use the listing copy above, keeping the wording original and franchise-free.
- Publish with public visibility only after the local preview and verification pass.
