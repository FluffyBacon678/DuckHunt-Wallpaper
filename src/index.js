import '@fontsource/press-start-2p/400.css';
import '@fontsource/teko/300.css';
import './sass/index.scss';

import Game from "./components/Game"
import LoadAssets from "./components/LoadAssets";

const GAME_WIDTH = 768;
const GAME_HEIGHT = 720;

const wallpaperSettings = {
    autoStart: false,
    duckSpeedMultiplier: 1,
    fitMode: 'contain',
    fps: 0,
    interactive: true,
    muted: false,
    showControls: true,
    showCursor: true,
    showHud: true,
    volume: 0.05,
};

let game = null;

function toBool(property) {
    return Boolean(property && property.value);
}

function toNumber(property, fallback) {
    if (!property) return fallback;
    let value = Number(property.value);
    return Number.isFinite(value) ? value : fallback;
}

function applyWallpaperSettings(properties) {
    if (properties.volume) {
        wallpaperSettings.volume = Math.max(0, Math.min(1, toNumber(properties.volume, 5) / 100));
    }

    if (properties.muted) {
        wallpaperSettings.muted = toBool(properties.muted);
    }

    if (properties.fitmode) {
        wallpaperSettings.fitMode = properties.fitmode.value;
    }

    if (properties.showhud) {
        wallpaperSettings.showHud = toBool(properties.showhud);
    }

    if (properties.showcontrols) {
        wallpaperSettings.showControls = toBool(properties.showcontrols);
    }

    if (properties.showcursor) {
        wallpaperSettings.showCursor = toBool(properties.showcursor);
    }

    if (properties.interactive) {
        wallpaperSettings.interactive = toBool(properties.interactive);
    }

    if (properties.autostart) {
        wallpaperSettings.autoStart = toBool(properties.autostart);
    }

    if (properties.duckspeed) {
        wallpaperSettings.duckSpeedMultiplier = Math.max(0.5, Math.min(2.5, toNumber(properties.duckspeed, 1)));
    }

    if (game) {
        game.applySettings(wallpaperSettings);

        if (wallpaperSettings.autoStart) {
            game.startFromMenu();
        }
    }
}

window.wallpaperPropertyListener = {
    applyUserProperties: function (properties) {
        applyWallpaperSettings(properties);
    },
    applyGeneralProperties: function (properties) {
        if (Object.prototype.hasOwnProperty.call(properties, 'fps')) {
            wallpaperSettings.fps = Number(properties.fps) || 0;
        }
    },
    setPaused: function (isPaused) {
        if (game) {
            game.setWallpaperPaused(isPaused);
        }
    }
};

document.body.dataset.fitMode = wallpaperSettings.fitMode;
document.body.dataset.cursor = wallpaperSettings.showCursor ? 'crosshair' : 'hidden';

let canvas = document.querySelector('#canvas');
let ctx = canvas.getContext('2d');
let loading = document.querySelector('.loading');

function startGame() {
    loading.classList.remove('visible');
    let backgroundGameImage = document.querySelector('#background');
    game.start();
    game.applySettings(wallpaperSettings);

    if (wallpaperSettings.autoStart) {
        game.startFromMenu();
    }

    window.pondPatrolWallpaper = {
        applyWallpaperSettings,
        game,
        settings: wallpaperSettings,
    };
    window.duckHuntWallpaper = window.pondPatrolWallpaper;

    let lastTime = 0;
    let frameAccumulator = 0;

    function gameLoop(timestamp) {
        let deltaTime = timestamp - lastTime;
        lastTime = timestamp;

        let fps = Number(wallpaperSettings.fps);
        if (fps > 0 && fps < 240) {
            frameAccumulator += deltaTime;
            if (frameAccumulator < 1000 / fps) {
                requestAnimationFrame(gameLoop);
                return;
            }

            deltaTime = frameAccumulator;
            frameAccumulator = 0;
        }

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(backgroundGameImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);

        game.update(deltaTime);
        game.draw();

        requestAnimationFrame(gameLoop);
    }

    gameLoop(0);
}

let loadAssets = new LoadAssets(startGame);

loadAssets.loadImages();
game = new Game(GAME_WIDTH, GAME_HEIGHT, ctx);
loadAssets.loadSounds();
