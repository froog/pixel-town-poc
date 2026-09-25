// Tiny synthesised soundscape: surf, summer cicadas by day, crickets at
// night, and the "kan-kan" of the level crossing. Everything is generated
// with WebAudio, no files.

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.on = false;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      this.on = true;
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5 * 0.6 + white * 0.4;
    }
    const loop = () => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.start();
      return src;
    };

    // surf: low-passed noise swelling slowly
    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 500;
    this.surf = ctx.createGain();
    this.surf.gain.value = 0.18;
    loop().connect(surfFilter).connect(this.surf).connect(this.master);
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.09;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.12;
    swell.connect(swellDepth).connect(this.surf.gain);
    swell.start();

    // cicadas: band-passed noise with fast tremolo
    const cic = ctx.createBiquadFilter();
    cic.type = 'bandpass';
    cic.frequency.value = 5200;
    cic.Q.value = 6;
    this.cicada = ctx.createGain();
    this.cicada.gain.value = 0;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const tremOsc = ctx.createOscillator();
    tremOsc.frequency.value = 38;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.5;
    tremOsc.connect(tremDepth).connect(trem.gain);
    tremOsc.start();
    loop().connect(cic).connect(trem).connect(this.cicada).connect(this.master);

    // crickets: chirping sine
    const cr = ctx.createOscillator();
    cr.frequency.value = 4300;
    const crGate = ctx.createGain();
    crGate.gain.value = 0;
    const crLfo = ctx.createOscillator();
    crLfo.type = 'square';
    crLfo.frequency.value = 14;
    const crLfoDepth = ctx.createGain();
    crLfoDepth.gain.value = 0.5;
    crLfo.connect(crLfoDepth).connect(crGate.gain);
    this.cricket = ctx.createGain();
    this.cricket.gain.value = 0;
    cr.connect(crGate).connect(this.cricket).connect(this.master);
    cr.start();
    crLfo.start();

    this.bellNext = 0;
    this.on = true;
  }

  stop() {
    if (this.ctx) this.ctx.suspend();
    this.on = false;
  }

  update(t, night, crossing, closeness) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    const day = 1 - night;
    this.cicada.gain.setTargetAtTime(0.05 * day * (0.6 + 0.4 * Math.sin(t * 0.15) ** 2), now, 0.5);
    const chirp = Math.sin(t * 1.6) > 0.3 ? 1 : 0;
    this.cricket.gain.setTargetAtTime(0.012 * night * chirp, now, 0.05);
    if (crossing && now >= this.bellNext) {
      this.bell(now, 0.06 + 0.1 * closeness);
      this.bellNext = now + 0.42;
    }
  }

  bell(when, vol) {
    const ctx = this.ctx;
    for (const f of [880, 1320]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * (f === 880 ? 1 : 0.4), when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
      o.connect(g).connect(this.master);
      o.start(when);
      o.stop(when + 0.4);
    }
  }
}
