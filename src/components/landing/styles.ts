import "./landing.css";

/**
 * Class names from landing.css. It is a global stylesheet with a `jl-` prefix because
 * next.config.ts sends every *.css file through Tailwind as plain CSS, which turns off
 * CSS-module hashing.
 */
const styles = {
  root: "jl-root",
  line: "jl-line",
  lineInner: "jl-lineInner",
  fadeUp: "jl-fadeUp",
  cardIn: "jl-cardIn",
  fan: "jl-fan",
  foil: "jl-foil",
  tilt: "jl-tilt",
  drift: "jl-drift",
  rise: "jl-rise",
  wipe: "jl-wipe",
  strike: "jl-strike",
  corrected: "jl-corrected",
  washAfter: "jl-washAfter",
  segment: "jl-segment",
  insert: "jl-insert",
  word: "jl-word",
  span: "jl-span",
  meter: "jl-meter",
  caught: "jl-caught",
} as const;

export default styles;
