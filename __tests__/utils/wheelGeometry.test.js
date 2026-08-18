import {
  boundaryAngle,
  outlinePath,
  pointAt,
  ringRadii,
  wedgePath,
  wheelSectorShape,
} from '../../app/utils/wheelGeometry';
import { ALIGNMENT_RINGS } from '../../app/utils/alignment';

/**
 * The wheel's arithmetic, asserted as numbers and strings.
 *
 * This is where the degenerate cases live, because they are invisible anywhere
 * else: under jest an SVG element accepts a negative radius and a `d` full of
 * NaN without a murmur, and only a browser refuses to draw them — on the one
 * target the suite already cannot see.
 */

const CENTRE = 100;
const RADIUS = 80;

/** Every number that reaches an SVG attribute has to actually be one. */
const isFinitePath = (d) => d.length > 0 && !/NaN|Infinity|undefined/.test(d);

describe('sector angles', () => {
  it('starts the first sector at twelve o\'clock', () => {
    expect(boundaryAngle(0, 8)).toBeCloseTo(-Math.PI / 2);
  });

  it('runs clockwise, which is what an increasing angle is on a screen', () => {
    // y grows downward in SVG, so a quarter turn on from the top is the right
    // hand side of the wheel.
    const [x, y] = pointAt(CENTRE, CENTRE, boundaryAngle(1, 4), RADIUS);
    expect(x).toBeCloseTo(CENTRE + RADIUS);
    expect(y).toBeCloseTo(CENTRE);
  });

  it('closes the circle exactly at the last boundary', () => {
    expect(boundaryAngle(6, 6)).toBeCloseTo(boundaryAngle(0, 6) + 2 * Math.PI);
  });
});

describe('a sector as a shape', () => {
  it('is a wedge for two sectors and up', () => {
    expect(wheelSectorShape(2)).toBe('wedge');
    expect(wheelSectorShape(8)).toBe('wedge');
    expect(wheelSectorShape(47)).toBe('wedge');
  });

  it('is a circle for a single sector', () => {
    // A wedge spanning a whole turn has coincident endpoints, and SVG draws no
    // arc at all between two identical points — the reader with exactly one very
    // important value would get an empty disc.
    expect(wheelSectorShape(1)).toBe('circle');
  });

  it('sets the large-arc flag exactly when the sector is more than half the wheel', () => {
    const third = wedgePath(CENTRE, CENTRE, RADIUS, boundaryAngle(0, 3), boundaryAngle(1, 3));
    const twoThirds = wedgePath(CENTRE, CENTRE, RADIUS, boundaryAngle(0, 3), boundaryAngle(2, 3));
    expect(third).toContain(`A ${RADIUS} ${RADIUS} 0 0 1`);
    expect(twoThirds).toContain(`A ${RADIUS} ${RADIUS} 0 1 1`);
  });

  it('draws from the centre and closes back to it', () => {
    const d = wedgePath(CENTRE, CENTRE, RADIUS, boundaryAngle(0, 8), boundaryAngle(1, 8));
    expect(d.startsWith(`M ${CENTRE} ${CENTRE} L`)).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(isFinitePath(d)).toBe(true);
  });
});

describe('the previous check-in outline', () => {
  const scores = (byIndex) => (index) => byIndex[index];

  it('closes the ring when every sector was answered', () => {
    const d = outlinePath(CENTRE, CENTRE, RADIUS, 4, scores([5, 6, 7, 8]));
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/M /g)).toHaveLength(1);
    expect(isFinitePath(d)).toBe(true);
  });

  it('breaks at a sector the earlier check-in never answered', () => {
    // A gap, not a step down to the centre: the earlier record said nothing
    // about that value, and drawing it at zero would claim it said the worst.
    const d = outlinePath(CENTRE, CENTRE, RADIUS, 4, scores([5, undefined, 7, 8]));
    expect(d.endsWith('Z')).toBe(false);
    expect(d.match(/M /g)).toHaveLength(2);
    expect(d.match(/A /g)).toHaveLength(3);
  });

  it('draws nothing when the earlier check-in shares no value with this wheel', () => {
    expect(outlinePath(CENTRE, CENTRE, RADIUS, 4, () => undefined)).toBe('');
  });

  it('draws nothing for a single sector, which is a ring rather than a path', () => {
    expect(outlinePath(CENTRE, CENTRE, RADIUS, 1, scores([7]))).toBe('');
  });

  it('draws nothing when there is no room to draw in', () => {
    // A container narrower than the label room leaves a negative radius, which
    // jest renders happily and a browser rejects outright.
    expect(outlinePath(CENTRE, CENTRE, 0, 4, scores([5, 6, 7, 8]))).toBe('');
    expect(outlinePath(CENTRE, CENTRE, -8, 4, scores([5, 6, 7, 8]))).toBe('');
  });

  it('stays finite at the crowded end of the range', () => {
    const many = Array.from({ length: 47 }, (_, i) => (i % 10) + 1);
    expect(isFinitePath(outlinePath(CENTRE, CENTRE, RADIUS, 47, scores(many)))).toBe(true);
  });
});

describe('the ring grid', () => {
  it('is one circle per ring, evenly spaced out to the rim', () => {
    const radii = ringRadii(RADIUS, ALIGNMENT_RINGS);
    expect(radii).toHaveLength(ALIGNMENT_RINGS);
    expect(radii[0]).toBeCloseTo(RADIUS / ALIGNMENT_RINGS);
    expect(radii[radii.length - 1]).toBeCloseTo(RADIUS);
  });
});
