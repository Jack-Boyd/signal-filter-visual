// src/audio/butterworth.ts
import type { Complex, FilterParams, BiquadSection } from "../types";

/**
 * Compute Q values for each biquad section of an Nth-order Butterworth.
 * For odd orders, the last section is first-order (Q is unused).
 */
export function getButterworthSections(order: number): BiquadSection[] {
  const sections: BiquadSection[] = [];
  const numBiquads = Math.floor(order / 2);

  for (let k = 0; k < numBiquads; k++) {
    const angle = (Math.PI * (2 * k + 1)) / (2 * order);
    const Q = 1 / (2 * Math.cos(angle));
    sections.push({ Q, isFirstOrder: false });
  }

  if (order % 2 === 1) {
    sections.push({ Q: 0.5, isFirstOrder: true });
  }

  return sections;
}

/**
 * Compute analog prototype poles for Butterworth of given order.
 * Returns only the left-half-plane poles.
 */
export function getAnalogPoles(order: number): Complex[] {
  const poles: Complex[] = [];
  for (let k = 0; k < order; k++) {
    const angle = (Math.PI * (2 * k + order + 1)) / (2 * order);
    poles.push({ re: Math.cos(angle), im: Math.sin(angle) });
  }
  return poles;
}

/**
 * Bilinear transform: maps s-plane pole to z-plane.
 * s_scaled = Ωa * s_prototype
 * z = (1 + s_d / (2*fs)) / (1 - s_d / (2*fs))
 */
export function bilinearTransform(
  sPole: Complex,
  analogCutoff: number,
  sampleRate: number
): Complex {
  const T = 1 / sampleRate;
  const sRe = analogCutoff * sPole.re;
  const sIm = analogCutoff * sPole.im;

  // z = (1 + s*T/2) / (1 - s*T/2)
  const halfT = T / 2;
  const numRe = 1 + sRe * halfT;
  const numIm = sIm * halfT;
  const denRe = 1 - sRe * halfT;
  const denIm = -sIm * halfT;

  const denMagSq = denRe * denRe + denIm * denIm;
  return {
    re: (numRe * denRe + numIm * denIm) / denMagSq,
    im: (numIm * denRe - numRe * denIm) / denMagSq,
  };
}

/**
 * Get z-plane poles and zeros for the Butterworth filter.
 */
export function getZPlanePolesAndZeros(
  params: FilterParams,
  sampleRate: number
): { poles: Complex[]; zeros: Complex[] } {
  const { order, cutoffFrequency, type } = params;

  // Frequency pre-warping
  const omegaD = (2 * Math.PI * cutoffFrequency) / sampleRate;
  const omegaA = (2 * sampleRate) * Math.tan(omegaD / 2);

  const analogPoles = getAnalogPoles(order);
  const poles = analogPoles.map((p) =>
    bilinearTransform(p, omegaA, sampleRate)
  );

  // Zeros: lowpass has all zeros at z = -1, highpass at z = +1
  const zeroLocation = type === "lowpass" ? -1 : 1;
  const zeros: Complex[] = Array.from({ length: order }, () => ({
    re: zeroLocation,
    im: 0,
  }));

  return { poles, zeros };
}

/**
 * Evaluate the theoretical frequency response H(e^{jω}).
 */
export function computeFrequencyResponse(
  params: FilterParams,
  sampleRate: number,
  numPoints: number = 512
): { frequencies: Float64Array; magnitudeDb: Float64Array; phase: Float64Array } {
  const { poles, zeros } = getZPlanePolesAndZeros(params, sampleRate);

  const frequencies = new Float64Array(numPoints);
  const magnitudeDb = new Float64Array(numPoints);
  const phase = new Float64Array(numPoints);

  for (let i = 0; i < numPoints; i++) {
    const freq = (i / numPoints) * (sampleRate / 2);
    const omega = (2 * Math.PI * freq) / sampleRate;
    frequencies[i] = freq;

    // e^{jω}
    const ejw: Complex = { re: Math.cos(omega), im: Math.sin(omega) };

    // H(z) = ∏(z - z_k) / ∏(z - p_k) * gain
    let numRe = 1,
      numIm = 0;
    for (const z of zeros) {
      const dRe = ejw.re - z.re;
      const dIm = ejw.im - z.im;
      const tmpRe = numRe * dRe - numIm * dIm;
      const tmpIm = numRe * dIm + numIm * dRe;
      numRe = tmpRe;
      numIm = tmpIm;
    }

    let denRe = 1,
      denIm = 0;
    for (const p of poles) {
      const dRe = ejw.re - p.re;
      const dIm = ejw.im - p.im;
      const tmpRe = denRe * dRe - denIm * dIm;
      const tmpIm = denRe * dIm + denIm * dRe;
      denRe = tmpRe;
      denIm = tmpIm;
    }

    const denMag = Math.sqrt(denRe * denRe + denIm * denIm);
    const numMag = Math.sqrt(numRe * numRe + numIm * numIm);

    const mag = numMag / denMag;
    magnitudeDb[i] = 20 * Math.log10(Math.max(mag, 1e-10));
    phase[i] = Math.atan2(
      numIm * denRe - numRe * denIm,
      numRe * denRe + numIm * denIm
    );
  }

  // Normalize so DC gain (lowpass) or Nyquist gain (highpass) = 0 dB
  const normIdx = params.type === "lowpass" ? 0 : numPoints - 1;
  const normVal = magnitudeDb[normIdx];
  for (let i = 0; i < numPoints; i++) {
    magnitudeDb[i] -= normVal;
  }

  return { frequencies, magnitudeDb, phase };
}