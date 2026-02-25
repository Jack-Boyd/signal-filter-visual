import type { FilterParams, SignalParams } from "../types";
import { designFilter } from "./filterDesign";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | OscillatorNode | null = null;
  private preAnalyser: AnalyserNode | null = null;
  private postAnalyser: AnalyserNode | null = null;
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

    // Load worklet from blob so we don't need a separate served file
    const processorCode = `
class FilterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sections = [];
    this.oldCoeffs = null;
    this.newCoeffs = null;
    this.interpPos = 0;
    this.interpFrames = 256;
    this.interpolating = false;
    this.port.onmessage = (e) => {
      if (e.data.type === "coefficients") this._updateCoefficients(e.data.sos);
    };
  }
  _updateCoefficients(sos) {
    const incoming = sos.map((s) => ({
      b0: s.b[0], b1: s.b[1], b2: s.b[2] ?? 0,
      a1: s.a[1] ?? 0, a2: s.a[2] ?? 0,
    }));
    if (incoming.length !== this.sections.length) {
      this.sections = incoming.map((c) => ({
        ...c, x1: 0, x2: 0, y1: 0, y2: 0,
      }));
      this.interpolating = false;
      return;
    }
    this.oldCoeffs = this.sections.map((s) => ({
      b0: s.b0, b1: s.b1, b2: s.b2, a1: s.a1, a2: s.a2,
    }));
    this.newCoeffs = incoming;
    this.interpPos = 0;
    this.interpolating = true;
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;
    if (this.sections.length === 0) { output.set(input); return true; }
    for (let i = 0; i < input.length; i++) {
      if (this.interpolating) {
        const alpha = this.interpPos / this.interpFrames;
        for (let s = 0; s < this.sections.length; s++) {
          const sec = this.sections[s];
          const o = this.oldCoeffs[s];
          const n = this.newCoeffs[s];
          sec.b0 = o.b0 + alpha * (n.b0 - o.b0);
          sec.b1 = o.b1 + alpha * (n.b1 - o.b1);
          sec.b2 = o.b2 + alpha * (n.b2 - o.b2);
          sec.a1 = o.a1 + alpha * (n.a1 - o.a1);
          sec.a2 = o.a2 + alpha * (n.a2 - o.a2);
        }
        this.interpPos++;
        if (this.interpPos >= this.interpFrames) {
          for (let s = 0; s < this.sections.length; s++) {
            const sec = this.sections[s];
            const n = this.newCoeffs[s];
            sec.b0 = n.b0; sec.b1 = n.b1; sec.b2 = n.b2;
            sec.a1 = n.a1; sec.a2 = n.a2;
          }
          this.interpolating = false;
        }
      }
      let sample = input[i];
      for (const sec of this.sections) {
        const y = sec.b0 * sample + sec.b1 * sec.x1 + sec.b2 * sec.x2
                  - sec.a1 * sec.y1 - sec.a2 * sec.y2;
        sec.x2 = sec.x1; sec.x1 = sample;
        sec.y2 = sec.y1; sec.y1 = y;
        sample = y;
      }
      output[i] = sample;
    }
    return true;
  }
}
registerProcessor("filter-processor", FilterProcessor);
`;
    const blob = new Blob([processorCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.preAnalyser = this.ctx.createAnalyser();
    this.preAnalyser.fftSize = 2048;
    this.postAnalyser = this.ctx.createAnalyser();
    this.postAnalyser.fftSize = 2048;
    this.masterGain = this.ctx.createGain();

    this.workletNode = new AudioWorkletNode(this.ctx, "filter-processor");

    // preAnalyser -> worklet -> postAnalyser -> masterGain -> destination
    this.workletNode.connect(this.postAnalyser);
    this.postAnalyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Prepare noise
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(
      1,
      bufferSize,
      this.ctx.sampleRate
    );
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  }

  private createSource(params: SignalParams): void {
    if (!this.ctx || !this.preAnalyser) return;
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
    // source -> preAnalyser -> workletNode
    this.sourceNode.connect(this.preAnalyser);
    this.preAnalyser.connect(this.workletNode!);
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
    this.masterGain?.gain.setTargetAtTime(
      gain,
      this.ctx!.currentTime,
      0.015
    );
  }

  updateSourceFrequency(freq: number): void {
    if (this.sourceNode && "frequency" in this.sourceNode) {
      this.sourceNode.frequency.setTargetAtTime(
        freq,
        this.ctx!.currentTime,
        0.015
      );
    }
  }

  getPreAnalyserData() {
    const time = new Float32Array(2048);
    const freq = new Uint8Array(1024);
    this.preAnalyser?.getFloatTimeDomainData(time);
    this.preAnalyser?.getByteFrequencyData(freq);
    return { time, freq };
  }

  getPostAnalyserData() {
    const time = new Float32Array(2048);
    const freq = new Uint8Array(1024);
    this.postAnalyser?.getFloatTimeDomainData(time);
    this.postAnalyser?.getByteFrequencyData(freq);
    return { time, freq };
  }

  stop(): void {
    this.stopSource();
    this.preAnalyser?.disconnect(this.workletNode!);
    this.isRunning = false;
  }

  destroy(): void {
    this.stop();
    this.workletNode?.disconnect();
    this.ctx?.close();
  }
}