import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { AudioEngine } from "./audio/audioEngine";
import { designFilter } from "./audio/filterDesign";
import { TimeDomainPlot } from "./components/TimeDomainPlot";
import { FrequencyDomainPlot } from "./components/FrequencyDomainPlot";
import { ZPlanePlot } from "./components/ZPlanePlot";
import { ControlPanel } from "./components/ControlPanel";
import { useAnimationFrame } from "./hooks/useAnimationFrame";
import type {
  FilterParams,
  FilterFamily,
  SignalParams,
  FilterDesignResult,
} from "./types";
import "./App.css";

const FAMILIES: FilterFamily[] = ["butterworth", "chebyshev", "bessel"];

const DEFAULT_FILTER: FilterParams = {
  family: "butterworth",
  type: "lowpass",
  order: 4,
  cutoffFrequency: 1000,
  rippleDb: 1,
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

  const [preTime, setPreTime] = useState<Float32Array<ArrayBufferLike>>(
    () => new Float32Array(2048)
  );
  const [postTime, setPostTime] = useState<Float32Array<ArrayBufferLike>>(
    () => new Float32Array(2048)
  );
  const [postFreq, setPostFreq] = useState<Uint8Array<ArrayBufferLike>>(
    () => new Uint8Array(1024)
  );

  const sampleRate = engineRef.current?.sampleRate ?? 44100;

  // Design all three families with shared order/type/cutoff
  const allDesigns = useMemo(() => {
    const results: { family: FilterFamily; result: FilterDesignResult }[] =
      [];
    for (const family of FAMILIES) {
      const params: FilterParams = {
        ...filterParams,
        family,
      };
      results.push({
        family,
        result: designFilter(params, sampleRate, 2048),
      });
    }
    return results;
  }, [filterParams, sampleRate]);

  const activeDesign = useMemo(
    () =>
      allDesigns.find((d) => d.family === filterParams.family)?.result ??
      allDesigns[0].result,
    [allDesigns, filterParams.family]
  );

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

  useEffect(() => {
    if (isRunning && engineRef.current) {
      engineRef.current.stop();
      engineRef.current.start(signalParams, filterParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalParams.type]);

  useEffect(() => {
    if (isRunning && engineRef.current) {
      engineRef.current.updateFilterParams(filterParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterParams.family]);

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
            sampleRate={sampleRate}
            isRunning={isRunning}
            onFilterChange={handleFilterChange}
            onSignalChange={handleSignalChange}
            onToggle={handleToggle}
          />

          <div className="info-card">
            <h3>Filter Properties</h3>
            <div className="info-row">
              <span
                className="dot"
                style={{ background: "#ffd93d" }}
              />
              <div>
                <strong>Butterworth</strong>
                <p>Maximally flat passband. No ripple.</p>
              </div>
            </div>
            <div className="info-row">
              <span
                className="dot"
                style={{ background: "#f472b6" }}
              />
              <div>
                <strong>Chebyshev I</strong>
                <p>
                  Steeper rolloff. Trades passband ripple (
                  {filterParams.rippleDb.toFixed(1)} dB) for
                  sharpness.
                </p>
              </div>
            </div>
            <div className="info-row">
              <span
                className="dot"
                style={{ background: "#4ade80" }}
              />
              <div>
                <strong>Bessel</strong>
                <p>
                  Maximally flat group delay. Best transient
                  response, gentlest rolloff.
                </p>
              </div>
            </div>
          </div>
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
              traces={allDesigns}
              activeFamily={filterParams.family}
              measuredFreq={postFreq}
              sampleRate={sampleRate}
              cutoffFrequency={filterParams.cutoffFrequency}
              rippleDb={filterParams.rippleDb}
              width={620}
              height={280}
            />
          </div>

          <div className="plot-row">
            <ZPlanePlot
              traces={allDesigns}
              activeFamily={filterParams.family}
              width={620}
              height={260}
            />
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-label">Order</span>
              <span className="stat-value">
                {filterParams.order}
              </span>
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
                {filterParams.type} ·{" "}
                {filterParams.cutoffFrequency} Hz
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Poles</span>
              <span className="stat-value">
                {activeDesign.poles.length}
              </span>
              <span className="stat-sub">
                Zeros: {activeDesign.zeros.length}
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}