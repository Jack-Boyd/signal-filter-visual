// src/components/FrequencyDomainPlot.tsx
import { useRef, useEffect, useCallback } from "react";

interface Props {
  theoreticalMagnitude: Float64Array;
  theoreticalFrequencies: Float64Array;
  measuredFreq: Uint8Array;
  sampleRate: number;
  cutoffFrequency: number;
  width?: number;
  height?: number;
}

const COLORS = {
  bg: "#0f0f1a",
  grid: "#1a1a3e",
  gridText: "#667",
  theoretical: "#ffd93d",
  measured: "#00d4ff44",
  measuredStroke: "#00d4ff",
  cutoff: "#ff6b6b88",
};

export function FrequencyDomainPlot({
  theoreticalMagnitude,
  theoreticalFrequencies,
  measuredFreq,
  sampleRate,
  cutoffFrequency,
  width = 600,
  height = 250,
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

    const pad = { top: 20, right: 20, bottom: 30, left: 50 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // dB range
    const dbMin = -80;
    const dbMax = 10;
    const dbRange = dbMax - dbMin;

    // Frequency range (log scale: 20 Hz to Nyquist)
    const fMin = 20;
    const fMax = sampleRate / 2;
    const logMin = Math.log10(fMin);
    const logMax = Math.log10(fMax);
    const logRange = logMax - logMin;

    const freqToX = (f: number) =>
      pad.left + ((Math.log10(Math.max(f, fMin)) - logMin) / logRange) * plotW;
    const dbToY = (db: number) =>
      pad.top + ((dbMax - Math.max(Math.min(db, dbMax), dbMin)) / dbRange) * plotH;

    // Grid lines - dB
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.font = "10px monospace";
    ctx.fillStyle = COLORS.gridText;
    ctx.textAlign = "right";
    for (let db = dbMin; db <= dbMax; db += 10) {
      const y = dbToY(db);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      if (db % 20 === 0) {
        ctx.fillText(`${db}dB`, pad.left - 5, y + 3);
      }
    }

    // Grid lines - frequency
    ctx.textAlign = "center";
    const freqTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    for (const f of freqTicks) {
      if (f > fMax) continue;
      const x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, height - pad.bottom);
      ctx.stroke();
      const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
      ctx.fillText(label, x, height - pad.bottom + 14);
    }

    // 0 dB line
    ctx.strokeStyle = "#334";
    ctx.lineWidth = 1.5;
    const zeroY = dbToY(0);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(width - pad.right, zeroY);
    ctx.stroke();

    // Cutoff line
    ctx.strokeStyle = COLORS.cutoff;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    const cutoffX = freqToX(cutoffFrequency);
    ctx.beginPath();
    ctx.moveTo(cutoffX, pad.top);
    ctx.lineTo(cutoffX, height - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Measured spectrum (filled)
    if (measuredFreq.length > 0) {
      ctx.fillStyle = COLORS.measured;
      ctx.beginPath();
      ctx.moveTo(pad.left, height - pad.bottom);
      const binCount = measuredFreq.length;
      for (let i = 0; i < binCount; i++) {
        const f = (i / binCount) * fMax;
        if (f < fMin) continue;
        const x = freqToX(f);
        // Convert 0-255 to dB
        const db = (measuredFreq[i] / 255) * dbRange + dbMin;
        const y = dbToY(db);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width - pad.right, height - pad.bottom);
      ctx.closePath();
      ctx.fill();
    }

    // Theoretical magnitude response
    ctx.strokeStyle = COLORS.theoretical;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < theoreticalFrequencies.length; i++) {
      const f = theoreticalFrequencies[i];
      if (f < fMin) continue;
      const x = freqToX(f);
      const y = dbToY(theoreticalMagnitude[i]);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Labels
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.theoretical;
    ctx.fillText("● Theoretical", 60, 16);
    ctx.fillStyle = COLORS.measuredStroke;
    ctx.fillText("● Measured", 170, 16);
    ctx.fillStyle = COLORS.gridText;
    ctx.fillText("FREQUENCY DOMAIN", width - 150, 16);
  }, [
    theoreticalMagnitude,
    theoreticalFrequencies,
    measuredFreq,
    sampleRate,
    cutoffFrequency,
    width,
    height,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, borderRadius: 8 }}
    />
  );
}