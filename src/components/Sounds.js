import Sound from "./Sound";

export default class Sounds {
    constructor() {
        this.start = new Sound('start.wav');

        this.intro = new Sound('intro.wav');

        this.duckFlapping = new Sound('bird-flapping.wav', true);
        this.duckFalling = new Sound('bird-falling.wav');
        this.duckDrop = new Sound('bird-drop.wav');

        this.duckCaught = new Sound('bird-caught.wav');
        this.gunShot= new Sound('pop-shot.wav');

        this.dogLaugh = new Sound('guide-laugh.wav');

        this.perfect = new Sound('perfect.wav');
        this.gameOver = new Sound('game-over.wav');
    }
}
