<script lang="ts">
  /** A range drawn in the app's own colours: the filled part in the accent, a round white knob. */
  let { value, min, max, step = 1, oninput, label = '' }: {
    value: number; min: number; max: number; step?: number; oninput: (v: number) => void; label?: string;
  } = $props();
  const fill = $derived(((value - min) / (max - min)) * 100);
</script>

<input class="slider" type="range" {min} {max} {step} {value} aria-label={label || undefined} style="--p: {fill}%"
  oninput={(e) => oninput(Number(e.currentTarget.value))} />

<style>
  .slider {
    appearance: none; -webkit-appearance: none; width: 160px; height: 22px; margin: 0; background: none; cursor: pointer;
  }
  .slider::-webkit-slider-runnable-track {
    height: 4px; border-radius: 2px;
    background: linear-gradient(to right, var(--accent) var(--p), var(--bg-active) var(--p));
  }
  .slider::-moz-range-track { height: 4px; border-radius: 2px; background: var(--bg-active); }
  .slider::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--accent); }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; width: 18px; height: 18px; margin-top: -7px; border-radius: 50%;
    background: #fff; box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.25); transition: transform 0.12s;
  }
  .slider::-moz-range-thumb { width: 18px; height: 18px; border: 0; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25); }
  .slider:active::-webkit-slider-thumb { transform: scale(1.12); }
  .slider:focus-visible { outline: none; }
  .slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--accent-soft), 0 1px 4px rgba(0, 0, 0, 0.25); }
  :global(html.mobile) .slider { width: 150px; height: 32px; }
  :global(html.mobile) .slider::-webkit-slider-thumb { width: 24px; height: 24px; margin-top: -10px; }
</style>
