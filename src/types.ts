// src/types.ts
export type FilterFamily = "butterworth" | "chebyshev" | "bessel";

export interface FilterParams {
  family: FilterFamily;
  type: "lowpass" | "highpass";
  order: number;
  cutoffFrequency: number;
  rippleDb: number;
}

export interface SignalParams {
  type: "sine" | "square" | "sawtooth" | "whitenoise" | "sweep";
  frequency: number;
  gain: number;
}

export type Complex = { re: number; im: number };

export interface SOSSection {
  b: [number, number, number];
  a: [number, number, number];
}

export interface FilterDesignResult {
  poles: Complex[];
  zeros: Complex[];
  sos: SOSSection[];
  frequencies: Float64Array;
  magnitudeDb: Float64Array;
  phase: Float64Array;
}