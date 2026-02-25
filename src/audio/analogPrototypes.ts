// src/audio/analogPrototypes.ts
import type { Complex } from "../types";

export function butterworthPoles(order: number): Complex[] {
  const poles: Complex[] = [];
  for (let k = 0; k < order; k++) {
    const angle = (Math.PI * (2 * k + order + 1)) / (2 * order);
    poles.push({ re: Math.cos(angle), im: Math.sin(angle) });
  }
  return poles;
}

export function chebyshevPoles(
  order: number,
  rippleDb: number
): { poles: Complex[]; passbandToDb3Scale: number } {
  const eps = Math.sqrt(Math.pow(10, rippleDb / 10) - 1);
  const mu = (1 / order) * Math.asinh(1 / eps);

  const poles: Complex[] = [];
  for (let k = 0; k < order; k++) {
    const theta = (Math.PI * (2 * k + 1)) / (2 * order);
    poles.push({
      re: -Math.sinh(mu) * Math.sin(theta),
      im: Math.cosh(mu) * Math.cos(theta),
    });
  }

  const scale = Math.cosh((1 / order) * Math.acosh(1 / eps));

  return { poles, passbandToDb3Scale: scale };
}

export function besselPoles(order: number): Complex[] {
  const DATA: Record<
    number,
    { poles: Complex[]; omega3dB: number }
  > = {
    1: {
      poles: [{ re: -1.0, im: 0 }],
      omega3dB: 1.0,
    },
    2: {
      poles: [
        { re: -1.1016, im: 0.6368 },
        { re: -1.1016, im: -0.6368 },
      ],
      omega3dB: 1.3617,
    },
    3: {
      poles: [
        { re: -1.0474, im: 0.9992 },
        { re: -1.0474, im: -0.9992 },
        { re: -1.3227, im: 0 },
      ],
      omega3dB: 1.7557,
    },
    4: {
      poles: [
        { re: -0.9953, im: 1.2571 },
        { re: -0.9953, im: -1.2571 },
        { re: -1.3707, im: 0.4103 },
        { re: -1.3707, im: -0.4103 },
      ],
      omega3dB: 2.1139,
    },
    5: {
      poles: [
        { re: -0.9576, im: 1.4711 },
        { re: -0.9576, im: -1.4711 },
        { re: -1.381, im: 0.7179 },
        { re: -1.381, im: -0.7179 },
        { re: -1.3851, im: 0 },
      ],
      omega3dB: 2.4274,
    },
    6: {
      poles: [
        { re: -0.9318, im: 1.6617 },
        { re: -0.9318, im: -1.6617 },
        { re: -1.3226, im: 0.9715 },
        { re: -1.3226, im: -0.9715 },
        { re: -1.3836, im: 0.1073 },
        { re: -1.3836, im: -0.1073 },
      ],
      omega3dB: 2.7034,
    },
    7: {
      poles: [
        { re: -0.9104, im: 1.8375 },
        { re: -0.9104, im: -1.8375 },
        { re: -1.2629, im: 1.1923 },
        { re: -1.2629, im: -1.1923 },
        { re: -1.378, im: 0.3213 },
        { re: -1.378, im: -0.3213 },
        { re: -1.3797, im: 0 },
      ],
      omega3dB: 2.9517,
    },
    8: {
      poles: [
        { re: -0.8955, im: 2.0044 },
        { re: -0.8955, im: -2.0044 },
        { re: -1.2062, im: 1.3926 },
        { re: -1.2062, im: -1.3926 },
        { re: -1.3683, im: 0.5287 },
        { re: -1.3683, im: -0.5287 },
        { re: -1.378, im: 0.0569 },
        { re: -1.378, im: -0.0569 },
      ],
      omega3dB: 3.1796,
    },
  };

  const entry = DATA[order];
  if (!entry) return DATA[2]!.poles;

  const scale = entry.omega3dB;
  return entry.poles.map((p) => ({
    re: p.re / scale,
    im: p.im / scale,
  }));
}