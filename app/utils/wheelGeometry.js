/**
 * The arithmetic behind the alignment wheel, with no React and no SVG in it.
 *
 * Split out because the drawing is the part that can be wrong in ways a render
 * test cannot see. Under jest, react-native-svg renders to native element stubs
 * that accept anything: a `Circle` with a negative radius and a `Path` whose `d`
 * contains `NaN` both produce a tree indistinguishable from a valid one, while a
 * browser rejects the first as an attribute error and fails to parse the second —
 * so the shape simply is not there, on the one target the test suite already
 * cannot see (see docs/DEVELOPMENT.md, "The web target").
 *
 * As plain numbers and strings, every degenerate case is assertable: one sector,
 * two, forty-seven, a container too small to draw in, a check-in with holes in
 * it.
 */

import { alignmentFraction } from './alignment';

/** Angle of sector boundary `index`, in radians, twelve o'clock being the first. */
export const boundaryAngle = (index, count) => -Math.PI / 2 + (2 * Math.PI * index) / count;

export const pointAt = (cx, cy, angle, radius) => [
  cx + radius * Math.cos(angle),
  cy + radius * Math.sin(angle),
];

/** Two decimals is finer than a physical pixel at every size this draws at. */
export const round = (n) => Math.round(n * 100) / 100;

/**
 * A wedge from the centre out to `radius`, spanning one sector.
 *
 * Never asked for a single sector: one sector spans a full turn, so the arc's
 * start and end points coincide and SVG draws nothing at all — a wheel that
 * silently renders as an empty disc for the reader who has exactly one very
 * important value. `wheelSectorShape` below is what decides that, and the
 * component draws a plain circle instead.
 */
export const wedgePath = (cx, cy, radius, from, to) => {
  const [x0, y0] = pointAt(cx, cy, from, radius);
  const [x1, y1] = pointAt(cx, cy, to, radius);
  const largeArc = to - from > Math.PI ? 1 : 0;
  return `M ${round(cx)} ${round(cy)} L ${round(x0)} ${round(y0)} `
    + `A ${round(radius)} ${round(radius)} 0 ${largeArc} 1 ${round(x1)} ${round(y1)} Z`;
};

/** Which primitive one sector has to be drawn as: 'circle' for a full turn. */
export const wheelSectorShape = (count) => (count === 1 ? 'circle' : 'wedge');

/**
 * The outline of an earlier check-in: each sector's arc at the radius it reached
 * then, joined by radial steps where two neighbours both have one.
 *
 * One path rather than a set of loose arcs, so it reads as a shape — the
 * silhouette is what is being compared, and a ring of disconnected strokes reads
 * as decoration. A sector the earlier check-in never answered breaks the path
 * instead of being drawn at zero, which would claim an answer nobody gave.
 *
 * Returns '' when there is nothing to draw, so the caller renders no element at
 * all rather than an empty `d`.
 */
export const outlinePath = (cx, cy, radius, count, scoreAt) => {
  if (count < 2 || radius <= 0) return '';

  let d = '';
  let drawing = false;
  let drawn = 0;

  for (let index = 0; index < count; index++) {
    const fraction = alignmentFraction(scoreAt(index));
    if (fraction <= 0) {
      drawing = false;
      continue;
    }

    const r = radius * fraction;
    const from = boundaryAngle(index, count);
    const to = boundaryAngle(index + 1, count);
    const [x0, y0] = pointAt(cx, cy, from, r);
    const [x1, y1] = pointAt(cx, cy, to, r);
    const largeArc = to - from > Math.PI ? 1 : 0;

    // `L` rather than `M` when the previous sector was drawn: the two arcs meet
    // at the same angle and different radii, so the join IS the step between
    // them.
    d += `${drawing ? 'L' : 'M'} ${round(x0)} ${round(y0)} `
      + `A ${round(r)} ${round(r)} 0 ${largeArc} 1 ${round(x1)} ${round(y1)} `;
    drawing = true;
    drawn++;
  }

  // Closing joins the last sector back to the first, which only means anything
  // when the ring is unbroken.
  return drawn === count ? `${d}Z` : d.trim();
};

/** Ring radii, innermost first — the grid a reader counts a sector's fill against. */
export const ringRadii = (radius, rings) => Array.from(
  { length: rings },
  (_, i) => (radius * (i + 1)) / rings,
);

/**
 * Which sector a point falls in — the hit test behind hovering and tapping the
 * wheel — or -1 for a point outside it.
 *
 * The wheel is one drawing rather than a set of pressable shapes, and this is
 * why: an unanswered sector puts no ink on the canvas at all, so there is
 * nothing there to hover. Asking the geometry instead means every sector can be
 * pointed at whether or not it has been answered, and it keeps the arithmetic
 * out of the component (see the note at the top of this file).
 *
 * `radius` is the hit radius, which is deliberately not the disc's: the sector
 * numbers are printed outside the rim and belong to the sector they label.
 */
export const sectorAt = (x, y, cx, cy, radius, count) => {
  if (count < 1 || radius <= 0) return -1;

  const dx = x - cx;
  const dy = y - cy;
  if (dx * dx + dy * dy > radius * radius) return -1;

  // A single sector is the whole turn, and atan2(0, 0) at the exact centre is a
  // legal 0 rather than a meaningful angle — both answer "the first one".
  if (count === 1 || (dx === 0 && dy === 0)) return 0;

  // Measured from twelve o'clock and running clockwise, so it matches the order
  // the sectors are drawn and numbered in.
  const turn = Math.atan2(dy, dx) - boundaryAngle(0, count);
  const fraction = ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
  // Clamped, because a fraction of exactly 1 arrives from rounding at the seam
  // and would name a sector that does not exist.
  return Math.min(count - 1, Math.floor(fraction * count));
};
