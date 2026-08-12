import React, { useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Line, Path, Circle, Rect, Polygon, G } from 'react-native-svg';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { seriesColor } from '../../styles/chartPalette';
import { parseDateKey, formatDateKeyShort, formatDateKey } from '../../utils/dateUtils';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '../../styles/designTokens';

const CHART_HEIGHT = 200;
const PADDING = { top: 12, right: 12, bottom: 26, left: 34 };
const LINE_WIDTH = 2;
const MARKER_RADIUS = 4.5; // ≥ 8px across
const GRID_STEPS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Marker shapes, one per series slot.
 *
 * Composite encoding — hue AND shape — rather than hue alone. A legend maps
 * colour to name, but matching a thin 2px line to a legend swatch by colour is
 * exactly the task colour-vision deficiency makes hard, and at phone width there
 * is no room to direct-label four line ends without collisions. Shape survives
 * both, and costs nothing.
 */
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'plus'];

export function markerShape(slot) {
  return SHAPES[slot % SHAPES.length];
}

function Marker({ shape, x, y, color, ring }) {
  const r = MARKER_RADIUS;
  const common = { fill: color, stroke: ring, strokeWidth: 2 };

  switch (shape) {
  case 'square':
    return <Rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1} {...common} />;
  case 'triangle':
    return <Polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} {...common} />;
  case 'diamond':
    return <Polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} {...common} />;
  case 'plus':
    return (
      <G>
        <Rect x={x - r - 1} y={y - 1.8} width={(r + 1) * 2} height={3.6} {...common} />
        <Rect x={x - 1.8} y={y - r - 1} width={3.6} height={(r + 1) * 2} {...common} />
      </G>
    );
  case 'circle':
  default:
    return <Circle cx={x} cy={y} r={r} {...common} />;
  }
}

Marker.propTypes = {
  shape: PropTypes.string.isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  ring: PropTypes.string.isRequired,
};

/**
 * How tracked values moved across calibrations.
 *
 * The x axis is time-proportional, not one-slot-per-calibration: three runs on
 * consecutive days followed by one six months later is a real shape, and evenly
 * spacing them would draw a steady drift that never happened.
 *
 * The y axis is the NORMALISED score, which is why a history spanning a scale
 * change still plots as one line — see app/utils/scales.js.
 *
 * @param {Array<{valueId, name, slot, points: Array<{assessedOn, normalized, score}>}>} series
 * @param {Array<string>} dates every calibration date, oldest first
 */
const TrendChart = ({ series, dates }) => {
  const { colors, mode } = useThemeColors();
  const { t, language } = useLocalization();
  const [width, setWidth] = useState(0);
  // The mobile stand-in for a hover crosshair: tap the plot to pin a calibration
  // and read every tracked value at that date.
  const [activeDate, setActiveDate] = useState(null);

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const { xFor, yFor } = useMemo(() => {
    const times = dates.map((d) => parseDateKey(d).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    // A single date, or several on the same day, would divide by zero; pin them
    // to the middle of the plot instead.
    const span = max - min || 1;

    return {
      xFor: (dateKey) => {
        if (max === min) return PADDING.left + plotWidth / 2;
        return PADDING.left + ((parseDateKey(dateKey).getTime() - min) / span) * plotWidth;
      },
      yFor: (normalized) => PADDING.top + (1 - normalized) * plotHeight,
    };
  }, [dates, plotWidth, plotHeight]);

  const handlePress = useCallback((event) => {
    if (!dates.length || plotWidth <= 0) return;
    const x = event.nativeEvent.locationX;
    // Nearest calibration by drawn position, so the pin lands where the reader
    // aimed even when two runs sit close together on a long axis.
    let nearest = dates[0];
    let best = Infinity;
    for (const dateKey of dates) {
      const distance = Math.abs(xFor(dateKey) - x);
      if (distance < best) {
        best = distance;
        nearest = dateKey;
      }
    }
    setActiveDate((prev) => (prev === nearest ? null : nearest));
  }, [dates, xFor, plotWidth]);

  if (series.length === 0 || dates.length === 0) return null;

  const activeReadout = activeDate
    ? series.map((s) => ({
      ...s,
      point: s.points.find((p) => p.assessedOn === activeDate) || null,
    }))
    : null;

  return (
    <View testID="trend-chart">
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Pressable onPress={handlePress} accessibilityRole="adjustable">
            <Svg width={width} height={CHART_HEIGHT}>
              {/* Grid, deliberately recessive — it locates a value, it is not a
                  thing to look at. */}
              {GRID_STEPS.map((step) => (
                <Line
                  key={`grid-${step}`}
                  x1={PADDING.left}
                  y1={yFor(step)}
                  x2={width - PADDING.right}
                  y2={yFor(step)}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              ))}

              {activeDate && (
                <Line
                  x1={xFor(activeDate)}
                  y1={PADDING.top}
                  x2={xFor(activeDate)}
                  y2={PADDING.top + plotHeight}
                  stroke={colors.mutedText}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}

              {series.map((s) => {
                const color = seriesColor(s.slot, mode);
                const points = s.points.filter((p) => p.normalized != null);
                if (points.length === 0) return null;

                const d = points
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.assessedOn)} ${yFor(p.normalized)}`)
                  .join(' ');

                return (
                  <G key={s.valueId}>
                    {points.length > 1 && (
                      <Path
                        d={d}
                        stroke={color}
                        strokeWidth={LINE_WIDTH}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {points.map((p) => (
                      <Marker
                        key={`${s.valueId}-${p.assessedOn}`}
                        shape={markerShape(s.slot)}
                        x={xFor(p.assessedOn)}
                        y={yFor(p.normalized)}
                        color={color}
                        // A 2px surface ring keeps two lines that cross at a
                        // point from merging into one blob.
                        ring={colors.surface}
                      />
                    ))}
                  </G>
                );
              })}
            </Svg>
          </Pressable>
        )}
      </View>

      {/* Axis labels sit outside the SVG so they inherit the app's text tokens
          rather than carrying a series colour. */}
      <View style={styles.yLabels} pointerEvents="none">
        <Text style={[styles.axisLabel, { color: colors.mutedText }]}>100%</Text>
        <Text style={[styles.axisLabel, { color: colors.mutedText }]}>0%</Text>
      </View>

      <View style={styles.xLabels}>
        <Text style={[styles.axisLabel, { color: colors.mutedText }]}>
          {formatDateKeyShort(dates[0], language)}
        </Text>
        {dates.length > 1 && (
          <Text style={[styles.axisLabel, { color: colors.mutedText }]}>
            {formatDateKeyShort(dates[dates.length - 1], language)}
          </Text>
        )}
      </View>

      {activeReadout && (
        <View style={[styles.readout, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.readoutDate, { color: colors.text }]}>
            {formatDateKey(activeDate, language)}
          </Text>
          {activeReadout.map((s) => (
            <View key={s.valueId} style={styles.readoutRow}>
              <View style={[styles.readoutSwatch, { backgroundColor: seriesColor(s.slot, mode) }]} />
              <Text numberOfLines={1} style={[styles.readoutName, { color: colors.text }]}>
                {s.name}
              </Text>
              <Text style={[styles.readoutValue, { color: colors.mutedText }]}>
                {s.point ? `${Math.round(s.point.normalized * 100)}%` : '—'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!activeReadout && (
        <Text style={[styles.hint, { color: colors.mutedText }]}>
          {t('history_chart_hint')}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  axisLabel: {
    fontSize: FONT_SIZE.xs,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  readout: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.sm,
    padding: SPACING.md,
  },
  readoutDate: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  readoutName: {
    flex: 1,
    fontSize: FONT_SIZE.md,
  },
  readoutRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  readoutSwatch: {
    borderRadius: 2,
    height: 10,
    width: 10,
  },
  readoutValue: {
    fontSize: FONT_SIZE.sm,
  },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING.left,
  },
  yLabels: {
    height: CHART_HEIGHT - PADDING.top - PADDING.bottom,
    justifyContent: 'space-between',
    left: 0,
    position: 'absolute',
    top: PADDING.top,
  },
});

TrendChart.propTypes = {
  series: PropTypes.array.isRequired,
  dates: PropTypes.array.isRequired,
};

export default TrendChart;
