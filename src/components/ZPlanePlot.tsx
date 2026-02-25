// src/components/PoleZeroPlot.tsx
import { useRef, useEffect, useCallback } from "react";
import type { FilterFamily, FilterDesignResult } from "../types";

interface FilterTrace {
  family: FilterFamily;
  result: FilterDesignResult;
}

interface Props {
  traces: FilterTrace[];
  activeFamily: FilterFamily;
  width?: number;
  height?: number;
}

const FAMILY_COLORS: Record<FilterFamily, { pole: string; zero: string }> = {
  butterworth: { pole: "#ffd93d", zero: "#ffd93d" },
  chebyshev: { pole: "#f472b6", zero: "#f472b6" },
  bessel: { pole: "#4ade80", zero: "#4ade80" },
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
  unitCircle: "#ffffff25",
  axes: "#334",
  activeBorder: "#ffffff30",
};

export function ZPlanePlot({
  traces,
  activeFamily,
  width = 620,
  height = 260,
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

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    const count = traces.length;
    const cellW = width / count;
    const pad = 16;

    for (let t = 0; t < count; t++) {
      const trace = traces[t];
      const isActive = trace.family === activeFamily;
      const colors = FAMILY_COLORS[trace.family];
      const offsetX = t * cellW;

      const plotSize = Math.min(cellW - pad * 2, height - 50);
      const cx = offsetX + cellW / 2;
      const cy = height / 2 + 8;
      const scale = plotSize * 0.4;

      // Active highlight border
      if (isActive) {
        ctx.strokeStyle = COLORS.activeBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(
          offsetX + 4,
          4,
          cellW - 8,
          height - 8
        );
      }

      // Grid circles
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 0.5;
      for (let r = 0.5; r <= 1.5; r += 0.5) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Axes
      ctx.strokeStyle = COLORS.axes;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(offsetX + pad, cy);
      ctx.lineTo(offsetX + cellW - pad, cy);
      ctx.moveTo(cx, 24);
      ctx.lineTo(cx, height - 16);
      ctx.stroke();

      // Unit circle
      ctx.strokeStyle = COLORS.unitCircle;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, scale, 0, Math.PI * 2);
      ctx.stroke();

      // Zeros (○)
      ctx.strokeStyle = colors.zero;
      ctx.lineWidth = 1.5;
      for (const z of trace.result.zeros) {
        const x = cx + z.re * scale;
        const y = cy - z.im * scale;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Poles (×)
      ctx.strokeStyle = colors.pole;
      ctx.lineWidth = 1.5;
      for (const p of trace.result.poles) {
        const x = cx + p.re * scale;
        const y = cy - p.im * scale;
        const s = 5;
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.stroke();
      }

      // Label
      ctx.font = "11px monospace";
      ctx.fillStyle = colors.pole;
      ctx.textAlign = "center";
      ctx.fillText(FAMILY_LABELS[trace.family], cx, 16);

      // Axis labels
      ctx.font = "9px monospace";
      ctx.fillStyle = COLORS.gridText;
      ctx.fillText("Re", offsetX + cellW - pad - 8, cy - 4);
      ctx.fillText("1", cx + scale + 2, cy + 12);
    }

    // Shared legend
    ctx.font = "10px monospace";
    ctx.fillStyle = COLORS.gridText;
    ctx.textAlign = "right";
    ctx.fillText("× poles   ○ zeros", width - 10, height - 6);
  }, [traces, activeFamily, width, height]);

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