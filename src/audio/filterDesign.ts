// src/audio/filterDesign.ts
import type {
  Complex,
  FilterParams,
  FilterDesignResult,
  SOSSection,
} from "../types";
import {
  butterworthPoles,
  chebyshevPoles,
  besselPoles,
} from "./analogPrototypes";

// ── Bilinear transform ─────────────────────────────────────────────

function bilinear(s: Complex, sampleRate: number): Complex {
  const T = 1 / sampleRate;
  const halfT = T / 2;
  const nRe = 1 + s.re * halfT;
  const nIm = s.im * halfT;
  const dRe = 1 - s.re * halfT;
  const dIm = -s.im * halfT;
  const dMag2 = dRe * dRe + dIm * dIm;
  return {
    re: (nRe * dRe + nIm * dIm) / dMag2,
    im: (nIm * dRe - nRe * dIm) / dMag2,
  };
}

// ── Get analog prototype poles (all normalized to −3 dB at ω = 1) ──

function getAnalogPoles(
  params: FilterParams
): Complex[] {
  const { family, order, rippleDb } = params;

  switch (family) {
    case "butterworth":
      return butterworthPoles(order);

    case "chebyshev": {
      const { poles } = chebyshevPoles(
        order,
        rippleDb
      );
      // Rescale from passband-edge normalization → −3 dB at ω = 1
      return poles;
    }

    case "bessel":
      return besselPoles(order);

    default:
      return butterworthPoles(order);
  }
}

// ── Pair conjugate poles → SOS sections ────────────────────────────

interface AnalogSOS {
  /** conjugate pair, or single real pole */
  poles: [Complex] | [Complex, Complex];
}

function pairConjugatePoles(poles: Complex[]): AnalogSOS[] {
  const used = new Array(poles.length).fill(false);
  const sections: AnalogSOS[] = [];

  for (let i = 0; i < poles.length; i++) {
    if (used[i]) continue;

    // Real pole (imaginary part ≈ 0)
    if (Math.abs(poles[i].im) < 1e-10) {
      used[i] = true;
      sections.push({ poles: [{ re: poles[i].re, im: 0 }] });
      continue;
    }

    // Find conjugate partner
    for (let j = i + 1; j < poles.length; j++) {
      if (used[j]) continue;
      if (
        Math.abs(poles[i].re - poles[j].re) < 1e-10 &&
        Math.abs(poles[i].im + poles[j].im) < 1e-10
      ) {
        used[i] = true;
        used[j] = true;
        sections.push({ poles: [poles[i], poles[j]] });
        break;
      }
    }

    // Safety: if no conjugate found, treat as real
    if (!used[i]) {
      used[i] = true;
      sections.push({ poles: [poles[i]] });
    }
  }

  return sections;
}

// ── Build SOS coefficients via bilinear transform ──────────────────

function buildSOS(
  params: FilterParams,
  sampleRate: number,
  analogPoles: Complex[]
): { sos: SOSSection[]; zPoles: Complex[]; zZeros: Complex[] } {
  const omegaD = (2 * Math.PI * params.cutoffFrequency) / sampleRate;
  const omegaA = 2 * sampleRate * Math.tan(omegaD / 2);

  const zeroZ = params.type === "lowpass" ? -1 : 1;
  const evalAt = params.type === "lowpass" ? 1 : -1; // DC or Nyquist

  const analogSections = pairConjugatePoles(analogPoles);
  const sos: SOSSection[] = [];
  const zPoles: Complex[] = [];
  const zZeros: Complex[] = [];

  for (const section of analogSections) {
    if (section.poles.length === 1) {
      // ── First-order section ──
      const sScaled: Complex = {
        re: omegaA * section.poles[0].re,
        im: 0,
      };
      const zp = bilinear(sScaled, sampleRate);
      zPoles.push(zp);
      zZeros.push({ re: zeroZ, im: 0 });

      // H(z) = (b0 + b1·z⁻¹) / (1 + a1·z⁻¹)
      const a1 = -zp.re;
      const b1Raw = -zeroZ;

      // Gain normalization
      const numAtEval = 1 + b1Raw * evalAt;
      const denAtEval = 1 + a1 * evalAt;
      const g = denAtEval / numAtEval;

      sos.push({
        b: [g, g * b1Raw, 0],
        a: [1, a1, 0],
      });
    } else {
      // ── Second-order section ──
      const s1: Complex = {
        re: omegaA * section.poles[0].re,
        im: omegaA * section.poles[0].im,
      };
      const s2: Complex = {
        re: omegaA * section.poles[1].re,
        im: omegaA * section.poles[1].im,
      };

      const zp1 = bilinear(s1, sampleRate);
      const zp2 = bilinear(s2, sampleRate);
      zPoles.push(zp1, zp2);
      zZeros.push(
        { re: zeroZ, im: 0 },
        { re: zeroZ, im: 0 }
      );

      // Denominator: (1 - zp1·z⁻¹)(1 - zp2·z⁻¹)
      // = 1 - (zp1+zp2)z⁻¹ + zp1·zp2·z⁻²
      const a1 = -(zp1.re + zp2.re);
      const a2 = zp1.re * zp2.re - zp1.im * zp2.im;

      // Numerator: (1 - zeroZ·z⁻¹)²
      const b1Raw = -2 * zeroZ;
      const b2Raw = zeroZ * zeroZ; // always 1

      // Gain normalization
      const numAtEval =
        1 + b1Raw * evalAt + b2Raw * evalAt * evalAt;
      const denAtEval =
        1 + a1 * evalAt + a2 * evalAt * evalAt;
      const g = denAtEval / numAtEval;

      sos.push({
        b: [g, g * b1Raw, g * b2Raw],
        a: [1, a1, a2],
      });
    }
  }

  return { sos, zPoles, zZeros };
}

// ── Frequency response from SOS ────────────────────────────────────

function evalSOS(
  sos: SOSSection[],
  sampleRate: number,
  numPoints: number
): { frequencies: Float64Array; magnitudeDb: Float64Array; phase: Float64Array } {
  const frequencies = new Float64Array(numPoints);
  const magnitudeDb = new Float64Array(numPoints);
  const phase = new Float64Array(numPoints);
  const nyquist = sampleRate / 2;

  for (let i = 0; i < numPoints; i++) {
    const f = (i / numPoints) * nyquist;
    frequencies[i] = f;
    const omega = (2 * Math.PI * f) / sampleRate;

    // e^{-jω} and e^{-j2ω}
    const cw = Math.cos(omega);
    const sw = Math.sin(omega);
    const c2w = Math.cos(2 * omega);
    const s2w = Math.sin(2 * omega);

    let totalRe = 1;
    let totalIm = 0;

    for (const s of sos) {
      // Numerator: b0 + b1·e^{-jω} + b2·e^{-j2ω}
      const nRe = s.b[0] + s.b[1] * cw + s.b[2] * c2w;
      const nIm = -s.b[1] * sw - s.b[2] * s2w;

      // Denominator: 1 + a1·e^{-jω} + a2·e^{-j2ω}
      const dRe = 1 + s.a[1] * cw + s.a[2] * c2w;
      const dIm = -s.a[1] * sw - s.a[2] * s2w;

      // Section response = num / den
      const dMag2 = dRe * dRe + dIm * dIm;
      const hRe = (nRe * dRe + nIm * dIm) / dMag2;
      const hIm = (nIm * dRe - nRe * dIm) / dMag2;

      // Accumulate total = total * h
      const tRe = totalRe * hRe - totalIm * hIm;
      const tIm = totalRe * hIm + totalIm * hRe;
      totalRe = tRe;
      totalIm = tIm;
    }

    const mag = Math.sqrt(totalRe * totalRe + totalIm * totalIm);
    magnitudeDb[i] = 20 * Math.log10(Math.max(mag, 1e-12));
    phase[i] = Math.atan2(totalIm, totalRe);
  }

  return { frequencies, magnitudeDb, phase };
}

// ── Public API ─────────────────────────────────────────────────────

export function designFilter(
  params: FilterParams,
  sampleRate: number,
  numFreqPoints: number = 1024
): FilterDesignResult {
  const analogPoles = getAnalogPoles(params);
  const { sos, zPoles, zZeros } = buildSOS(
    params,
    sampleRate,
    analogPoles
  );
  const { frequencies, magnitudeDb, phase } = evalSOS(
    sos,
    sampleRate,
    numFreqPoints
  );

  return {
    poles: zPoles,
    zeros: zZeros,
    sos,
    frequencies,
    magnitudeDb,
    phase,
  };
}