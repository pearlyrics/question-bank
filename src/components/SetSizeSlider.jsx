import { SET_SIZE_MIN, SET_SIZE_STEP, setCount, sliderMax } from '../lib/sets.js'

// The slider reads as a measuring stick on the sheet: drag the size, see
// immediately how many sets that cuts the bank into.
export default function SetSizeSlider({ total, setSize, onChange }) {
  const max = sliderMax(total)
  const count = setCount(total, setSize)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <label htmlFor="set-size" className="font-mono text-[13px] text-muted">
        Questions per set
      </label>
      <div className="flex min-w-[180px] flex-1 items-center gap-3">
        <input
          id="set-size"
          type="range"
          className="set-slider"
          min={SET_SIZE_MIN}
          max={max}
          step={SET_SIZE_STEP}
          value={Math.min(setSize, max)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output
          htmlFor="set-size"
          className="min-w-[3.5ch] font-mono text-sm tabular-nums text-accent"
        >
          {setSize}
        </output>
      </div>
      <span className="font-mono text-[13px] text-muted tabular-nums">
        {count} set{count === 1 ? '' : 's'} of {setSize} · {total} in bank
      </span>
    </div>
  )
}
