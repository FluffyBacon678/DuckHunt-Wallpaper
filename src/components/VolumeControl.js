
export default class VolumeControl {
    constructor(game) {
        this.game = game;
        this.panel = document.querySelector('.volume');
        this.volumeDown = document.querySelector('.volume-down');
        this.volumeUp = document.querySelector('.volume-up');
        this.volumeMute = document.querySelector('.volume-mute');

        if (this.volumeDown) this.volumeDown.addEventListener('click', () => this.game.changeVolume(-0.02));
        if (this.volumeUp) this.volumeUp.addEventListener('click', () => this.game.changeVolume(0.05));
        if (this.volumeMute) this.volumeMute.addEventListener('click', () => this.game.toggleMute());

    }

    setMuted(isMuted) {
        if (this.volumeMute) this.volumeMute.classList.toggle('active', isMuted);
    }

    setVisible(isVisible) {
        if (this.panel) this.panel.classList.toggle('hidden', !isVisible);
    }
}
