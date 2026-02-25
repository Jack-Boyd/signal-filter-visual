// src/App.tsx
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { AudioEngine } from "./audio/audioEngine";
import {
  computeFrequencyResponse,
  getZPlanePolesAndZeros,
} from "./audio/butterworth";
import { TimeDomainPlot } from "./components/TimeDomainPlot";
import { FrequencyDomainPlot } from "./components/FrequencyDomainPlot";
import { PoleZeroPlot } from "./components/PoleZeroPlot";
import { ControlPanel } from "./components/ControlPanel";
import { useAnimationFrame } from "./hooks/useAnimationFrame";
import type { FilterParams, SignalParams } from "./types";
import "./App.css";

const DEFAULT_FILTER: FilterParams = {
  family: 'butterworth',
  type: "lowpass",
  order: 4,
  cutoffFrequency: 1000,
};

const DEFAULT_SIGNAL: SignalParams = {
  type: "whitenoise",
  frequency: 440,
  gain: 0.3,
};

export default function App() {
  const engineRef = useRef<AudioEngine | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [filterParams, setFilterParams] = useState(DEFAULT_FILTER);
  const [signalParams, setSignalParams] = useState(DEFAULT_SIGNAL);

  // Live data state
  const [preTime, setPreTime] = useState<Float32Array<ArrayBufferLike>>(
    () => new Float32Array(2048)
  );
  const [postTime, setPostTime] = useState<Float32Array<ArrayBufferLike>>(
    () => new Float32Array(2048)
  );
  const [postFreq, setPostFreq] = useState<Uint8Array<ArrayBufferLike>>(
    () => new Uint8Array(1024)
  );

  const sampleRate = engineRef.current?.sampleRate ?? 48000;

  // Theoretical computations (pure math, no audio needed)
  const freqResponse = useMemo(
    () => computeFrequencyResponse(filterParams, sampleRate, 1024),
    [filterParams, sampleRate]
  );

  const poleZero = useMemo(
    () => getZPlanePolesAndZeros(filterParams, sampleRate),
    [filterParams, sampleRate]
  );

  // Animation loop for reading analyser data
  useAnimationFrame(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const pre = engine.getPreAnalyserData();
    const post = engine.getPostAnalyserData();
    setPreTime(pre.time);
    setPostTime(post.time);
    setPostFreq(post.freq);
  }, isRunning);

  const handleToggle = useCallback(async () => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
      await engineRef.current.init();
    }
    const engine = engineRef.current;
    if (engine.running) {
      engine.stop();
      setIsRunning(false);
    } else {
      engine.start(signalParams, filterParams);
      setIsRunning(true);
    }
  }, [signalParams, filterParams]);

  const handleFilterChange = useCallback(
    (params: FilterParams) => {
      setFilterParams(params);
      if (isRunning && engineRef.current) {
        engineRef.current.updateFilterParams(params);
      }
    },
    [isRunning]
  );

  const handleSignalChange = useCallback(
    (params: SignalParams) => {
      setSignalParams(params);
      if (isRunning && engineRef.current) {
        engineRef.current.updateGain(params.gain);
        engineRef.current.updateSourceFrequency(params.frequency);
      }
    },
    [isRunning]
  );

  // Restart source if signal type changes while running
  useEffect(() => {
    if (isRunning && engineRef.current) {
      engineRef.current.stop();
      engineRef.current.start(signalParams, filterParams);
    }
    // Only re-trigger on signal type change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalParams.type]);

  // Cleanup
  useEffect(() => {
    return () => engineRef.current?.destroy();
  }, []);

  return (
    <div className="app">
      <div className="layout">
        <aside>
          <ControlPanel
            filterParams={filterParams}
            signalParams={signalParams}
            isRunning={isRunning}
            onFilterChange={handleFilterChange}
            onSignalChange={handleSignalChange}
            onToggle={handleToggle}
          />
        </aside>
        <main>
          <div className="plot-row">
            <TimeDomainPlot
              preData={preTime}
              postData={postTime}
              width={620}
              height={220}
            />
          </div>
          <div className="plot-row">
            <FrequencyDomainPlot
              theoreticalMagnitude={freqResponse.magnitudeDb}
              theoreticalFrequencies={freqResponse.frequencies}
              measuredFreq={postFreq}
              sampleRate={sampleRate}
              cutoffFrequency={filterParams.cutoffFrequency}
              width={620}
              height={250}
            />
          </div>
          <div className="plot-row">
            <PoleZeroPlot
              poles={poleZero.poles}
              zeros={poleZero.zeros}
              width={260}
              height={260}
            />
          </div>
<div className="stats-row">
            <div className="stat-card">
              <span className="stat-label">Order</span>
              <span className="stat-value">{filterParams.order}</span>
              <span className="stat-sub">
                {Math.floor(filterParams.order / 2) +
                  (filterParams.order % 2)}{" "}
                section{filterParams.order > 1 ? "s" : ""}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Rolloff</span>
              <span className="stat-value">
                {filterParams.order * 20} dB/dec
              </span>
              <span className="stat-sub">
                {filterParams.order * 6} dB/oct
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Active Filter</span>
              <span className="stat-value">
                {filterParams.family.charAt(0).toUpperCase() +
                  filterParams.family.slice(1)}
              </span>
              <span className="stat-sub">
                {filterParams.type} · {filterParams.cutoffFrequency} Hz
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Poles</span>
              <span className="stat-value">{poleZero.poles.length}</span>
              <span className="stat-sub">
                Zeros: {poleZero.zeros.length}
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}