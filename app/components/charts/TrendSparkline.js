import React from 'react';
import PropTypes from 'prop-types';
import Svg, { Path, Line, Circle } from 'react-native-svg';

// Room for the end dot's radius, so the newest point is never clipped by the
// edge of the card it sits in.
const INSET_X = 5;
const INSET_Y = 5;
const LINE_WIDTH = 2;
const DOT_RADIUS = 2;
const END_DOT_RADIUS = 3.5;

/**
 * One value's trajectory, card-sized.
 *
 * This is the small-multiples half of the history screen: a grid of these, one
 * per tracked value, is what lets ten or twenty values be read at once. The
 * overlay chart cannot — past about five lines no set of hues stays tellable
 * apart under colour-vision deficiency, and the honest fix is fewer lines rather
 * than more colours. A grid sidesteps the problem instead of fighting it: every
 * cell is its own frame, direct-labelled by the card around it, so identity is
 * never carried by colour at all.
 *
 * Two things make the grid a comparison rather than twenty unrelated pictures,
 * and both are the caller's job to keep true:
 *
 *   the x axis is shared — `axis` comes from `timeAxis(dates)` over EVERY
 *   calibration date, not this value's own, so a value first rated last month
 *   starts a third of the way across rather than at the left edge like all the
 *   others; and
 *
 *   the y axis is shared and absolute — always 0..1 of the normalised score,
 *   never scaled to this value's own range, which is the classic sparkline
 *   mistake that draws a wobble between 0.62 and 0.64 as a mountain.
 *
 * A value with a single point gets a dot at its level and a dashed rule across
 * the card, not a flat line: one calibration is a position, and drawing it as a
 * horizontal run would claim a stability that was never measured.
 */
const TrendSparkline = ({
  points, axis, width, height, color, baselineColor, surfaceColor,
}) => {
  const usable = (points || []).filter((point) => point.normalized != null);
  if (width <= 0 || usable.length === 0) return null;

  const plotWidth = Math.max(width - INSET_X * 2, 1);
  const plotHeight = Math.max(height - INSET_Y * 2, 1);
  const xFor = (dateKey) => INSET_X + axis(dateKey) * plotWidth;
  const yFor = (normalized) => INSET_Y + (1 - normalized) * plotHeight;
  const baseline = yFor(0);

  const single = usable.length === 1;

  const line = usable
    .map((point, i) => `${i === 0 ? 'M' : 'L'} ${xFor(point.assessedOn)} ${yFor(point.normalized)}`)
    .join(' ');
  const firstX = xFor(usable[0].assessedOn);
  const lastPoint = usable[usable.length - 1];
  const lastX = xFor(lastPoint.assessedOn);
  const area = `${line} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;

  return (
    <Svg width={width} height={height}>
      {/* The floor of the shared scale. Every card draws it at the same place,
          which is what stops each sparkline being read against itself. */}
      <Line
        x1={0}
        y1={baseline}
        x2={width}
        y2={baseline}
        stroke={baselineColor}
        strokeWidth={1}
      />

      {single ? (
        <Line
          x1={0}
          y1={yFor(lastPoint.normalized)}
          x2={width}
          y2={yFor(lastPoint.normalized)}
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.5}
          strokeDasharray="3 3"
        />
      ) : (
        <>
          <Path d={area} fill={color} fillOpacity={0.16} stroke="none" />
          <Path
            d={line}
            stroke={color}
            strokeWidth={LINE_WIDTH}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {usable.slice(0, -1).map((point) => (
            <Circle
              key={point.assessedOn}
              cx={xFor(point.assessedOn)}
              cy={yFor(point.normalized)}
              r={DOT_RADIUS}
              fill={color}
            />
          ))}
        </>
      )}

      {/* The newest reading, ringed in the card's own colour so it stays legible
          where the line doubles back over it. */}
      <Circle
        cx={lastX}
        cy={yFor(lastPoint.normalized)}
        r={END_DOT_RADIUS}
        fill={color}
        stroke={surfaceColor}
        strokeWidth={1.5}
      />
    </Svg>
  );
};

TrendSparkline.propTypes = {
  points: PropTypes.array.isRequired,
  axis: PropTypes.func.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  baselineColor: PropTypes.string.isRequired,
  surfaceColor: PropTypes.string.isRequired,
};

export default TrendSparkline;
