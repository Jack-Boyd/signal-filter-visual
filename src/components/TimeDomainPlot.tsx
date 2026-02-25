// src/components/TimeDomainPlot.tsx
import { useRef, useEffect, useCallback } from "react";

interface Props {
  preData: Float32Array;
  postData: Float32Array;
  width?: number;
  height?: number;
}

const COLORS = {
  bg: "#0f0f1a",
  grid: "#1a1a3e",
  gridText: "#667",
  input: "#00d4ff",
  output: "#ff6b6b",
};

export function TimeDomainPlot({
  preData,
  postData,
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

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const midY = height / 2;
    for (let y = 0; y <= height; y += height / 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let x = 0; x <= width; x += width / 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Zero line
    ctx.strokeStyle = "#334";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Draw waveform helper
    const drawWaveform = (data: Float32Array, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const samples = Math.min(data.length, 1024);
      const step = width / samples;
      for (let i = 0; i < samples; i++) {
        const x = i * step;
        const y = midY - data[i] * midY * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawWaveform(preData, COLORS.input);
    drawWaveform(postData, COLORS.output);

    // Labels
    ctx.font = "11px monospace";
    ctx.fillStyle = COLORS.input;
    ctx.fillText("● Input", 10, 16);
    ctx.fillStyle = COLORS.output;
    ctx.fillText("● Output", 75, 16);

    ctx.fillStyle = COLORS.gridText;
    ctx.fillText("TIME DOMAIN", width - 100, 16);
  }, [preData, postData, width, height]);

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