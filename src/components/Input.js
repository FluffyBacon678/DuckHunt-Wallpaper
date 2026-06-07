export default class Input {
    constructor(game, canvas) {
        this.game = game;
        this.canvas = canvas;
        canvas.addEventListener("mousedown", (event) => {
            event.preventDefault();
            this.setPointerPosition(event);

            if (!game.settings.interactive) {
                return;
            }

            if (game.gamestate === 2) {
                this.menuStartGame();
                return;
            }

            if (game.gamestate) {
                if (game.canShoot && this.limitShoot) {
                    this.game.sounds.gunShot.play();
                    this.counter = 0;
                    game.gameStats.shoot++;
                }
            }
        });

        document.addEventListener("keydown", event => {
            if (event.keyCode === 27 && game.settings.interactive) {
                game.togglePause();
            }
        })
        this.counter = 0;
        this.limitShoot = true;
    }

    setPointerPosition(event) {
        let rect = this.canvas.getBoundingClientRect();
        let scaleX = this.canvas.width / rect.width;
        let scaleY = this.canvas.height / rect.height;

        this.mouseX = (event.clientX - rect.left) * scaleX;
        this.mouseY = (event.clientY - rect.top) * scaleY;
    }

    menuStartGame() {
        if (this.game.input.mouseX > 236 && this.game.input.mouseX < 531 &&
            this.game.input.mouseY > 447 && this.game.input.mouseY < 473) {
            this.game.startFromMenu();
        }
    }

    limitClick(deltaTime) {
        this.counter += deltaTime / 16;
        this.limitShoot = this.counter >= 50;
    }
}
