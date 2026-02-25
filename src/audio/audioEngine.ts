// src/audio/audioEngine.ts
import type { FilterParams, SignalParams } from "../types";
import { getButterworthSections } from "./butterworth";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | OscillatorNode | null = null;
  private filterNodes: BiquadFilterNode[] = [];
  private preAnalyser: AnalyserNode | null = null;
  private postAnalyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private isRunning = false;
  private noiseBuffer: AudioBuffer | null = null;

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  get running(): boolean {
    return this.isRunning;
  }

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.preAnalyser = this.ctx.createAnalyser();
    this.preAnalyser.fftSize = 2048;
    this.preAnalyser.smoothingTimeConstant = 0.5;

    this.postAnalyser = this.ctx.createAnalyser();
    this.postAnalyser.fftSize = 2048;
    this.postAnalyser.smoothingTimeConstant = 0.5;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 0.3;

    // Pre-generate noise buffer
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(
      1,
      bufferSize,
      this.ctx.sampleRate
    );
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  private createSource(params: SignalParams): void {
    if (!this.ctx) return;
    this.stopSource();

    if (params.type === "whitenoise") {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      this.sourceNode = source;
    } else if (params.type === "sweep") {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(20, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        20000,
        this.ctx.currentTime + 4
      );
      this.sourceNode = osc;
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = params.type as OscillatorType;
      osc.frequency.value = params.frequency;
      this.sourceNode = osc;
    }
  }

  private stopSource(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch {
        /* already stopped */
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
  }

  buildFilterChain(filterParams: FilterParams): void {
    if (!this.ctx) return;

    // Disconnect old filters
    this.filterNodes.forEach((n) => n.disconnect());
    this.filterNodes = [];

    const sections = getButterworthSections(filterParams.order);

    for (const section of sections) {
      const biquad = this.ctx.createBiquadFilter();
      biquad.type = filterParams.type;
      biquad.frequency.value = filterParams.cutoffFrequency;

      if (section.isFirstOrder) {
        // Approximate 1st-order with a biquad at Q ≈ 0.5
        // BiquadFilterNode doesn't do true 1st-order, but Q=0.5
        // gives a reasonable approximation for cascaded Butterworth
        biquad.Q.value = 0.5;
      } else {
        biquad.Q.value = section.Q;
      }

      this.filterNodes.push(biquad);
    }

    this.reconnect();
  }

  private reconnect(): void {
    if (
      !this.sourceNode ||
      !this.preAnalyser ||
      !this.postAnalyser ||
      !this.gainNode ||
      !this.ctx
    )
      return;

    // Disconnect everything
    this.sourceNode.disconnect();
    this.preAnalyser.disconnect();
    this.filterNodes.forEach((n) => n.disconnect());
    this.postAnalyser.disconnect();

    // Reconnect: source → preAnalyser → filters → postAnalyser → gain → dest
    this.sourceNode.connect(this.preAnalyser);

    let lastNode: AudioNode = this.preAnalyser;
    for (const filter of this.filterNodes) {
      lastNode.connect(filter);
      lastNode = filter;
    }

    lastNode.connect(this.postAnalyser);
    this.postAnalyser.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
  }

  start(
    signalParams: SignalParams,
    filterParams: FilterParams
  ): void {
    if (!this.ctx) return;

    this.createSource(signalParams);
    this.buildFilterChain(filterParams);

    if (this.gainNode) {
      this.gainNode.gain.value = signalParams.gain;
    }

    this.sourceNode?.start();
    this.isRunning = true;
  }

  stop(): void {
    this.stopSource();
    this.isRunning = false;
  }

  updateFilterParams(params: FilterParams): void {
    if (!this.ctx || this.filterNodes.length === 0) {
      if (this.isRunning) this.buildFilterChain(params);
      return;
    }

    const sections = getButterworthSections(params.order);

    // If order changed, rebuild
    if (sections.length !== this.filterNodes.length) {
      // Need to rebuild entirely
      const wasRunning = this.isRunning;
      if (wasRunning) {
        this.buildFilterChain(params);
      }
      return;
    }

    // Just update frequency and Q
    for (let i = 0; i < this.filterNodes.length; i++) {
      this.filterNodes[i].type = params.type;
      this.filterNodes[i].frequency.value = params.cutoffFrequency;
      this.filterNodes[i].Q.value = sections[i].isFirstOrder
        ? 0.5
        : sections[i].Q;
    }
  }

  updateGain(gain: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = gain;
    }
  }

  updateSourceFrequency(freq: number): void {
    if (
      this.sourceNode &&
      "frequency" in this.sourceNode
    ) {
      (this.sourceNode as OscillatorNode).frequency.value = freq;
    }
  }

  getPreAnalyserData(): { time: Float32Array; freq: Uint8Array } {
    if (!this.preAnalyser) {
      return {
        time: new Float32Array(1024),
        freq: new Uint8Array(512),
      };
    }
    const time = new Float32Array(this.preAnalyser.fftSize);
    const freq = new Uint8Array(this.preAnalyser.frequencyBinCount);
    this.preAnalyser.getFloatTimeDomainData(time);
    this.preAnalyser.getByteFrequencyData(freq);
    return { time, freq };
  }

  getPostAnalyserData(): { time: Float32Array; freq: Uint8Array } {
    if (!this.postAnalyser) {
      return {
        time: new Float32Array(1024),
        freq: new Uint8Array(512),
      };
    }
    const time = new Float32Array(this.postAnalyser.fftSize);
    const freq = new Uint8Array(this.postAnalyser.frequencyBinCount);
    this.postAnalyser.getFloatTimeDomainData(time);
    this.postAnalyser.getByteFrequencyData(freq);
    return { time, freq };
  }

  destroy(): void {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
  }
}