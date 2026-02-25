// src/components/PoleZeroPlot.tsx
import { useRef, useEffect, useCallback } from "react";
import type { Complex } from "../types";

interface Props {
  poles: Complex[];
  zeros: Complex[];
  width?: number;
  height?: number;
}

const COLORS = {
  bg: "#0f0f1a",
  grid: "#1a1a3e",
  gridText: "#667",
  unitCircle: "#ffffff30",
  axes: "#334",
  pole: "#ff6b6b",
  zero: "#00d4ff",
};

export function PoleZeroPlot({
  poles,
  zeros,
  width = 350,
  height = 350,
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

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.35;

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Grid circles
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let r = 0.5; r <= 2; r += 0.5) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = COLORS.axes;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();

    // Unit circle
    ctx.strokeStyle = COLORS.unitCircle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, scale, 0, Math.PI * 2);
    ctx.stroke();

    // Axis labels
    ctx.font = "10px monospace";
    ctx.fillStyle = COLORS.gridText;
    ctx.textAlign = "center";
    ctx.fillText("Re", width - 15, cy - 5);
    ctx.fillText("Im", cx + 12, 12);
    ctx.fillText("1", cx + scale + 2, cy + 14);
    ctx.fillText("-1", cx - scale - 2, cy + 14);

    // Draw zeros (○)
    ctx.strokeStyle = COLORS.zero;
    ctx.lineWidth = 2;
    for (const z of zeros) {
      const x = cx + z.re * scale;
      const y = cy - z.im * scale;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw poles (×)
    ctx.strokeStyle = COLORS.pole;
    ctx.lineWidth = 2;
    for (const p of poles) {
      const x = cx + p.re * scale;
      const y = cy - p.im * scale;
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.stroke();
    }

    // Legend
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.pole;
    ctx.fillText("× Poles", 10, 16);
    ctx.fillStyle = COLORS.zero;
    ctx.fillText("○ Zeros", 10, 30);
    ctx.fillStyle = COLORS.gridText;
    ctx.fillText("Z-PLANE", width - 65, 16);
  }, [poles, zeros, width, height]);

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