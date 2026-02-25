// src/components/ControlPanel.tsx
import type { FilterParams, SignalParams } from "../types";

interface Props {
  filterParams: FilterParams;
  signalParams: SignalParams;
  isRunning: boolean;
  onFilterChange: (params: FilterParams) => void;
  onSignalChange: (params: SignalParams) => void;
  onToggle: () => void;
}

export function ControlPanel({
  filterParams,
  signalParams,
  isRunning,
  onFilterChange,
  onSignalChange,
  onToggle,
}: Props) {
  return (
    <div className="control-panel">
      <div className="control-section">
        <h3>Signal Source</h3>
        <label>
          Type
          <select
            value={signalParams.type}
            onChange={(e) =>
              onSignalChange({
                ...signalParams,
                type: e.target.value as SignalParams["type"],
              })
            }
          >
            <option value="sine">Sine</option>
            <option value="square">Square</option>
            <option value="sawtooth">Sawtooth</option>
            <option value="whitenoise">White Noise</option>
            <option value="sweep">Sweep (20–20kHz)</option>
          </select>
        </label>

        {signalParams.type !== "whitenoise" &&
          signalParams.type !== "sweep" && (
            <label>
              Frequency: {signalParams.frequency} Hz
              <input
                type="range"
                min={20}
                max={5000}
                step={1}
                value={signalParams.frequency}
                onChange={(e) =>
                  onSignalChange({
                    ...signalParams,
                    frequency: Number(e.target.value),
                  })
                }
              />
            </label>
          )}

        <label>
          Volume: {Math.round(signalParams.gain * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={signalParams.gain}
            onChange={(e) =>
              onSignalChange({
                ...signalParams,
                gain: Number(e.target.value),
              })
            }
          />
        </label>
      </div>

      <div className="control-section">
        <h3>Butterworth Filter</h3>
        <label>
          Type
          <select
            value={filterParams.type}
            onChange={(e) =>
              onFilterChange({
                ...filterParams,
                type: e.target.value as FilterParams["type"],
              })
            }
          >
            <option value="lowpass">Lowpass</option>
            <option value="highpass">Highpass</option>
          </select>
        </label>

        <label>
          Order: {filterParams.order}
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={filterParams.order}
            onChange={(e) =>
              onFilterChange({
                ...filterParams,
                order: Number(e.target.value),
              })
            }
          />
        </label>

        <label>
          Cutoff: {filterParams.cutoffFrequency} Hz
          <input
            type="range"
            min={20}
            max={24000}
            step={10}
            value={filterParams.cutoffFrequency}
            onChange={(e) =>
              onFilterChange({
                ...filterParams,
                cutoffFrequency: Number(e.target.value),
              })
            }
          />
        </label>
      </div>

      <button className={`toggle-btn ${isRunning ? "running" : ""}`} onClick={onToggle}>
        {isRunning ? "⏹ Stop" : "▶ Start"}
      </button>
    </div>
  );
}