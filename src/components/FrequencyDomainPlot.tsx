// src/components/ComparisonFrequencyPlot.tsx
import { useRef, useEffect, useCallback } from "react";
import type { FilterDesignResult, FilterFamily } from "../types";

interface FilterTrace {
  family: FilterFamily;
  result: FilterDesignResult;
}

interface Props {
  traces: FilterTrace[];
  activeFamily: FilterFamily;
  measuredFreq: Uint8Array<ArrayBufferLike>;
  sampleRate: number;
  cutoffFrequency: number;
  rippleDb: number;
  width?: number;
  height?: number;
}

const FAMILY_COLORS: Record<FilterFamily, string> = {
  butterworth: "#ffd93d",
  chebyshev: "#f472b6",
  bessel: "#4ade80",
};

const FAMILY_LABELS: Record<FilterFamily, string> = {
  butterworth: "Butterworth",
  chebyshev: "Chebyshev I",
  bessel: "Bessel",
};

const COLORS = {
  bg: "#0f0f1a",
  grid: "#1a1a3e",
  gridText: "#667",
  measured: "#ffffff18",
  cutoff: "#ff6b6b88",
  db3: "#ff6b6b44",
  axes: "#334",
  rippleBand: "#f472b620",
  rippleLine: "#f472b666",
};

export function FrequencyDomainPlot({
  traces,
  activeFamily,
  measuredFreq,
  sampleRate,
  cutoffFrequency,
  rippleDb,
  width = 620,
  height = 280,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 30, right: 20, bottom: 30, left: 50 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Zoom-dependent ranges
    const dbMin = -80;
    const dbMax = 10;
    const dbRange = dbMax - dbMin;

    // Frequency range
    const fMin =  20;
    const fMax = sampleRate / 2;
    const logMin = Math.log10(Math.max(fMin, 1));
    const logMax = Math.log10(fMax);
    const logRange = logMax - logMin;

    const freqToX = (f: number) =>
      pad.left +
      ((Math.log10(Math.max(f, fMin)) - logMin) / logRange) * plotW;
    const dbToY = (db: number) =>
      pad.top +
      ((dbMax - Math.max(Math.min(db, dbMax), dbMin)) / dbRange) *
        plotH;

    // dB grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    ctx.fillStyle = COLORS.gridText;
    ctx.textAlign = "right";

    const dbStep = 10;
    for (
      let db = Math.ceil(dbMin / dbStep) * dbStep;
      db <= dbMax;
      db += dbStep
    ) {
      const y = dbToY(db);
      if (y < pad.top || y > height - pad.bottom) continue;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      const label = `${db}dB`;
      ctx.fillText(label, pad.left - 5, y + 3);
    }

    // Freq grid
    ctx.textAlign = "center";
    const freqTicks: number[] = [
        20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
      ];
    for (const f of freqTicks) {
      if (f > fMax || f < fMin) continue;
      const x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, height - pad.bottom);
      ctx.stroke();
      const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
      ctx.fillText(label, x, height - pad.bottom + 14);
    }

    // 0 dB line
    ctx.strokeStyle = COLORS.axes;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, dbToY(0));
    ctx.lineTo(width - pad.right, dbToY(0));
    ctx.stroke();

    // Ripple band highlight (only meaningful in passband zoom
    // but shown in both modes when visible)
    {
      const rippleTopY = dbToY(0);
      const rippleBottomY = dbToY(-rippleDb);
      if (rippleBottomY > pad.top && rippleTopY < height - pad.bottom) {
        // Shaded band from 0 to -rippleDb, up to cutoff frequency
        const cutX = freqToX(cutoffFrequency);
        ctx.fillStyle = COLORS.rippleBand;
        ctx.fillRect(
          pad.left,
          rippleTopY,
          cutX - pad.left,
          rippleBottomY - rippleTopY
        );

        // Dashed line at -rippleDb
        ctx.strokeStyle = COLORS.rippleLine;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, rippleBottomY);
        ctx.lineTo(width - pad.right, rippleBottomY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = COLORS.rippleLine;
        ctx.textAlign = "left";
        ctx.font = "10px monospace";
        ctx.fillText(
          `-${rippleDb.toFixed(1)}dB ripple`,
          pad.left + 4,
          rippleBottomY - 3
        );
      }
    }

    // -3 dB reference
    const db3Y = dbToY(-3);
    if (db3Y > pad.top && db3Y < height - pad.bottom) {
      ctx.strokeStyle = COLORS.db3;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, db3Y);
      ctx.lineTo(width - pad.right, db3Y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ff6b6b88";
      ctx.textAlign = "right";
      ctx.fillText("-3dB", width - pad.right - 4, db3Y - 3);
    }

    // Cutoff line
    const cutoffX = freqToX(cutoffFrequency);
    ctx.strokeStyle = COLORS.cutoff;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cutoffX, pad.top);
    ctx.lineTo(cutoffX, height - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Measured spectrum fill (only in full zoom)
    if (measuredFreq.length > 0) {
      ctx.fillStyle = COLORS.measured;
      ctx.beginPath();
      ctx.moveTo(pad.left, height - pad.bottom);
      const binCount = measuredFreq.length;
      for (let i = 0; i < binCount; i++) {
        const f = (i / binCount) * (sampleRate / 2);
        if (f < fMin) continue;
        const x = freqToX(f);
        const db = (measuredFreq[i] / 255) * 90 - 80;
        ctx.lineTo(x, dbToY(db));
      }
      ctx.lineTo(width - pad.right, height - pad.bottom);
      ctx.closePath();
      ctx.fill();
    }

    // Draw each filter family trace
    for (const trace of traces) {
      const color = FAMILY_COLORS[trace.family];
      const isActive = trace.family === activeFamily;

      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.globalAlpha = isActive ? 1 : 0.5;

      if (!isActive) {
        ctx.setLineDash([6, 4]);
      }

      ctx.beginPath();
      let started = false;
      const { frequencies, magnitudeDb } = trace.result;
      for (let i = 0; i < frequencies.length; i++) {
        if (frequencies[i] < fMin || frequencies[i] > fMax) continue;
        const x = freqToX(frequencies[i]);
        const y = dbToY(magnitudeDb[i]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Legend
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    let legendX = 60;
    for (const trace of traces) {
      const color = FAMILY_COLORS[trace.family];
      const label = FAMILY_LABELS[trace.family];
      const isActive = trace.family === activeFamily;

      ctx.fillStyle = color;
      ctx.globalAlpha = isActive ? 1 : 0.5;
      const prefix = isActive ? "▶ " : "● ";
      ctx.fillText(`${prefix}${label}`, legendX, 18);
      legendX += ctx.measureText(`${prefix}${label}`).width + 16;
    }
    ctx.globalAlpha = 1;

    // Zoom label
    ctx.fillStyle = COLORS.gridText;
    ctx.textAlign = "right";
    const modeLabel = "MAGNITUDE COMPARISON";
    ctx.fillText(modeLabel, width - pad.right, 18);
  }, [
    traces,
    activeFamily,
    measuredFreq,
    sampleRate,
    cutoffFrequency,
    rippleDb,
    width,
    height,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas ref={canvasRef} style={{ width, height, borderRadius: 8 }} />
  );
}