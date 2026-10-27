import type { MusicMood, MusicScene } from "./music-scene";

const MOOD_INTERVALS: Record<MusicMood, number[]> = {
  calm: [0, 7, 12, 16],
  warm: [0, 4, 7, 11],
  reflective: [0, 3, 7, 10],
  tense: [0, 1, 7, 8],
  bright: [0, 4, 7, 14],
};

const CHORD_SECONDS = 8.5;
const MASTER_VOLUME = 0.16;

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const legacy = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return window.AudioContext ?? legacy;
}

/**
 * 程序化环境音乐：不依赖外部音频素材，也不使用受版权保护的旋律。
 * 低音量长音铺底 + 稀疏钟声，场景切换时在下一组和弦自然过渡。
 */
export class AmbientMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private padBus: GainNode | null = null;
  private timer: number | null = null;
  private running = false;
  private disposed = false;
  private step = 0;
  private scene: MusicScene = { id: "idle", label: "静默", rootMidi: 48, mood: "calm" };

  static isSupported(): boolean {
    return Boolean(audioContextConstructor());
  }

  async start(scene: MusicScene): Promise<void> {
    if (this.disposed) return;
    this.scene = scene;
    const context = this.ensureGraph();
    if (this.running) {
      if (context.state === "suspended") await context.resume();
      return;
    }
    this.running = true;
    this.step = 0;
    if (context.state === "suspended") await context.resume();
    const now = context.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setValueAtTime(Math.max(0.0001, this.master!.gain.value), now);
    this.master!.gain.exponentialRampToValueAtTime(MASTER_VOLUME, now + 1.6);
    this.playChord();
    this.scheduleNext();
  }

  setScene(scene: MusicScene): void {
    this.scene = scene;
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    const context = this.context;
    this.context = null;
    this.master = null;
    this.padBus = null;
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }

  private ensureGraph(): AudioContext {
    if (this.context) return this.context;
    const Context = audioContextConstructor();
    if (!Context) throw new Error("当前浏览器不支持 Web Audio");
    const context = new Context();
    const master = context.createGain();
    master.gain.value = 0.0001;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.6;
    master.connect(compressor).connect(context.destination);

    const padBus = context.createGain();
    padBus.gain.value = 1;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1150;
    filter.Q.value = 0.6;
    padBus.connect(filter);

    const dry = context.createGain();
    dry.gain.value = 0.72;
    filter.connect(dry).connect(master);

    const convolver = context.createConvolver();
    convolver.buffer = this.createImpulse(context);
    const wet = context.createGain();
    wet.gain.value = 0.34;
    filter.connect(convolver);
    convolver.connect(wet).connect(master);

    this.context = context;
    this.master = master;
    this.padBus = padBus;
    return context;
  }

  private createImpulse(context: AudioContext): AudioBuffer {
    const seconds = 2.6;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        const decay = Math.pow(1 - index / length, 2.8);
        data[index] = (Math.random() * 2 - 1) * decay;
      }
    }
    return impulse;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = window.setTimeout(() => {
      if (!this.running) return;
      this.playChord();
      this.scheduleNext();
    }, CHORD_SECONDS * 1000);
  }

  private playChord(): void {
    const context = this.context;
    const padBus = this.padBus;
    if (!context || !padBus || !this.running) return;
    const now = context.currentTime + 0.05;
    const intervals = MOOD_INTERVALS[this.scene.mood];
    const root = this.scene.rootMidi;

    intervals.forEach((interval, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = midiToFrequency(root + interval);
      const peak = 0.075 / (index + 1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 2.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 9.2);
      oscillator.connect(gain);
      if (typeof context.createStereoPanner === "function") {
        const panner = context.createStereoPanner();
        panner.pan.value = index % 2 === 0 ? -0.3 : 0.3;
        gain.connect(panner);
        panner.connect(padBus);
      } else {
        gain.connect(padBus);
      }
      oscillator.start(now);
      oscillator.stop(now + 9.4);
    });

    const drone = context.createOscillator();
    const droneGain = context.createGain();
    drone.type = "sine";
    drone.frequency.value = midiToFrequency(root - 12);
    droneGain.gain.setValueAtTime(0.0001, now);
    droneGain.gain.exponentialRampToValueAtTime(0.045, now + 3.2);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 9.6);
    drone.connect(droneGain).connect(padBus);
    drone.start(now);
    drone.stop(now + 9.8);

    if (this.step % 3 === 0) this.playBell(midiToFrequency(root + 24), now + 3.6);
    this.step += 1;
  }

  private playBell(frequency: number, at: number): void {
    const context = this.context;
    const padBus = this.padBus;
    if (!context || !padBus) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.035, at + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 4.6);
    oscillator.connect(gain).connect(padBus);
    oscillator.start(at);
    oscillator.stop(at + 4.8);
  }
}
