import { useCallback, useEffect, useRef, useState } from "react";

interface TrafficSliderProps {
  value: number;
  /** 仅在拖动结束（指针抬起）或键盘步进后触发，避免拖动过程中连续请求 */
  onChange: (value: number) => void;
  disabled?: boolean;
}

const KEYBOARD_COMMIT_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export function TrafficSlider({ value, onChange, disabled }: TrafficSliderProps) {
  const rangeRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitIfChanged = useCallback(
    (next: number) => {
      if (disabled) return;
      if (next !== value) onChange(next);
    },
    [disabled, onChange, value],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(Number(e.target.value));
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      commitIfChanged(Number(e.currentTarget.value));
    },
    [commitIfChanged],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!KEYBOARD_COMMIT_KEYS.has(e.key)) return;
      commitIfChanged(Number(e.currentTarget.value));
    },
    [commitIfChanged],
  );

  const bluePercent = 100 - draft;

  return (
    <div className="relative flex items-center">
      <div className="pointer-events-none absolute inset-x-0 h-2 overflow-hidden rounded-full">
        <div
          className="absolute inset-y-0 left-0 bg-blue-500 transition-[width] duration-75"
          style={{ width: `${bluePercent}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-emerald-500 transition-[width] duration-75"
          style={{ width: `${draft}%` }}
        />
      </div>
      <input
        ref={rangeRef}
        type="range"
        min={0}
        max={100}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        onKeyUp={handleKeyUp}
        className="relative z-10 h-2 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-zinc-700 [&::-moz-range-thumb]:shadow-md dark:[&::-moz-range-thumb]:border-zinc-300 dark:[&::-moz-range-thumb]:bg-zinc-200 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-zinc-700 [&::-webkit-slider-thumb]:shadow-md dark:[&::-webkit-slider-thumb]:border-zinc-300 dark:[&::-webkit-slider-thumb]:bg-zinc-200"
      />
    </div>
  );
}
