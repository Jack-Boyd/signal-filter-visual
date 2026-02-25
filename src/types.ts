// src/types.ts
export type FilterFamily = "butterworth" | "chebyshev" | "bessel";

export interface FilterParams {
  family: FilterFamily;
  type: "lowpass" | "highpass";
  order: number;
  cutoffFrequency: number;
}

export interface SignalParams {
  type: "sine" | "square" | "sawtooth" | "whitenoise" | "sweep";
  frequency: number;
  gain: number;
}

export type Complex = { re: number; im: number };

export interface BiquadSection {
  Q: number;
  isFirstOrder: boolean;
}