
export default class Sound {
    constructor(src, loop = false) {
        this.sound = document.createElement("audio");
        this.sound.src = 'audio/' + src;
        this.sound.setAttribute("preload", "auto");
        this.sound.setAttribute("controls", "none");
        if (loop) {
            this.sound.loop = true;
        }
        this.sound.volume = 0.05;
        this.sound.style.display = "none";
        document.body.appendChild(this.sound);
    }

    play = function () {
        const playRequest = this.sound.play();
        if (playRequest && playRequest.catch) {
            playRequest.catch(() => {});
        }
    }

    stop = function () {
        this.sound.pause();
        this.sound.currentTime = 0;
    }

    get loop() {
        return this.sound.loop;
    }

    set loop(value) {
        this.sound.loop = value;
    }

    get paused() {
        return this.sound.paused;
    }

    get volume() {
        return this.sound.volume;
    }

    set volume(value) {
        this.sound.volume = value;
    }
}
