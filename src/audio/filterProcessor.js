class FilterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sections = []; // { b0,b1,b2,a1,a2, x1,x2,y1,y2 }
    this.oldCoeffs = null;
    this.newCoeffs = null;
    this.interpPos = 0;
    this.interpFrames = 256; // ~6ms at 44100
    this.interpolating = false;

    this.port.onmessage = (e) => {
      if (e.data.type === "coefficients") {
        this._updateCoefficients(e.data.sos);
      }
    };
  }

  _updateCoefficients(sos) {
    const incoming = sos.map((s) => ({
      b0: s.b[0],
      b1: s.b[1],
      b2: s.b[2] ?? 0,
      a1: s.a[1] ?? 0,
      a2: s.a[2] ?? 0,
    }));

    if (incoming.length !== this.sections.length) {
      // Order changed — hard reset (no way to interpolate different topologies)
      this.sections = incoming.map((c) => ({
        ...c,
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0,
      }));
      this.interpolating = false;
      return;
    }

    // Same section count — smooth interpolation
    this.oldCoeffs = this.sections.map((s) => ({
      b0: s.b0,
      b1: s.b1,
      b2: s.b2,
      a1: s.a1,
      a2: s.a2,
    }));
    this.newCoeffs = incoming;
    this.interpPos = 0;
    this.interpolating = true;
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];

    if (!input || !output) return true;

    if (this.sections.length === 0) {
      output.set(input);
      return true;
    }

    for (let i = 0; i < input.length; i++) {
      // Per-sample coefficient interpolation
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
            sec.b0 = n.b0;
            sec.b1 = n.b1;
            sec.b2 = n.b2;
            sec.a1 = n.a1;
            sec.a2 = n.a2;
          }
          this.interpolating = false;
        }
      }

      // Cascade through biquad sections
      let sample = input[i];
      for (const sec of this.sections) {
        const y =
          sec.b0 * sample +
          sec.b1 * sec.x1 +
          sec.b2 * sec.x2 -
          sec.a1 * sec.y1 -
          sec.a2 * sec.y2;
        sec.x2 = sec.x1;
        sec.x1 = sample;
        sec.y2 = sec.y1;
        sec.y1 = y;
        sample = y;
      }
      output[i] = sample;
    }

    return true;
  }
}

registerProcessor("filter-processor", FilterProcessor);