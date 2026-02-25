import type { FilterParams, SignalParams } from "../types";
import { designFilter } from "./filterDesign";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | OscillatorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private isRunning = false;

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }
  get running(): boolean {
    return this.isRunning;
  }

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    await this.ctx.audioWorklet.addModule(
      new URL("./filterProcessor.js", import.meta.url),
    );

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain = this.ctx.createGain();

    this.workletNode = new AudioWorkletNode(this.ctx, "filter-processor");

    // preAnalyser -> worklet -> postAnalyser -> masterGain -> destination
    this.workletNode.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Prepare noise
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(
      1,
      bufferSize,
      this.ctx.sampleRate,
    );
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  }

  private createSource(params: SignalParams): void {
    if (!this.ctx) return;
    this.stopSource();

    if (params.type === "whitenoise") {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      this.sourceNode = source;
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = params.type as OscillatorType;
      osc.frequency.value = params.frequency;
      this.sourceNode = osc;
    }

    this.sourceNode.connect(this.workletNode!);
  }

  private stopSource(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
  }

  private sendCoefficients(params: FilterParams): void {
    if (!this.ctx || !this.workletNode) return;

    // Clamp cutoff to 95% of Nyquist — bilinear transform is
    // unstable as it approaches sampleRate/2
    const nyquist = this.ctx.sampleRate / 2;
    const clamped: FilterParams = {
      ...params,
      cutoffFrequency: Math.min(params.cutoffFrequency, nyquist * 0.95),
    };

    const result = designFilter(clamped, this.ctx.sampleRate);
    this.workletNode.port.postMessage({
      type: "coefficients",
      sos: result.sos.map((section) => ({
        b: [...section.b],
        a: [...section.a],
      })),
    });
  }

  start(signalParams: SignalParams, filterParams: FilterParams): void {
    if (!this.ctx) return;
    this.createSource(signalParams);
    this.sendCoefficients(filterParams);
    this.masterGain!.gain.value = signalParams.gain;
    this.sourceNode?.start();
    this.isRunning = true;
  }

  updateFilterParams(params: FilterParams): void {
    if (!this.isRunning) return;
    this.sendCoefficients(params);
  }

  updateGain(gain: number): void {
    this.masterGain?.gain.setTargetAtTime(gain, this.ctx!.currentTime, 0.015);
  }

  updateSourceFrequency(freq: number): void {
    if (this.sourceNode && "frequency" in this.sourceNode) {
      this.sourceNode.frequency.setTargetAtTime(
        freq,
        this.ctx!.currentTime,
        0.015,
      );
    }
  }

  getAnalyserData() {
    const time = new Float32Array(2048);
    const freq = new Uint8Array(1024);
    this.analyser?.getFloatTimeDomainData(time);
    this.analyser?.getByteFrequencyData(freq);
    return { time, freq };
  }

  stop(): void {
    this.stopSource();
    this.isRunning = false;
  }

  destroy(): void {
    this.stop();
    this.workletNode?.disconnect();
    this.ctx?.close();
  }
}
