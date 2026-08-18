import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, PixelRatio } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { priorityColor } from '../../styles/chartPalette';
import { ALIGNMENT_RINGS, alignmentBand, alignmentFraction } from '../../utils/alignment';
import {
  boundaryAngle, outlinePath, pointAt, ringRadii, round, wedgePath, wheelSectorShape,
} from '../../utils/wheelGeometry';
import { FONT_SIZE } from '../../styles/designTokens';

/**
 * The wheel: one sector per very important value, ten rings deep.
 *
 * It is the drawing this feature came from, rendered rather than reinterpreted —
 * the centre is "my behaviour does not correspond to my values" and the outer
 * edge is "I live fully in accordance with them", so a sector filled to the
 * seventh ring is a 7. The two captions are printed by the screen above and
 * below, because they are sentences and belong to the app's type scale rather
 * than inside an SVG.
 *
 * Colour is the ORDINAL ramp, not the categorical one. The question a reader
 * asks here is "how far out", which is magnitude — the same job the ranked bars
 * do — and eight unrelated hues would answer "which one" instead. Every sector
 * is also numbered, and the numbered list beneath the wheel names it and prints
 * its score, so nothing rests on colour alone.
 *
 * THE MATHS IS NOT IN HERE. app/utils/wheelGeometry.js owns it, and the reason is
 * in that file: under jest an SVG accepts a negative radius and a `d` full of
 * NaN without complaint, and only a browser refuses to draw them. This component
 * is therefore only worth asserting structurally — a sector element per scored
 * value, ten rings, an outline when there is a previous check-in — and belongs on
 * the short list of things to open `dist/index.html` and look at after a change
 * (see docs/DEVELOPMENT.md, "The web target").
 */

const NUMBER_SIZE = FONT_SIZE.xs;

/**
 * The wheel takes the width it is given, up to this. It is not pinned smaller,
 * because the sector count is the reader's own answer — "very important" on the
 * three-word scale can easily be twenty of the forty-seven — and every pixel of
 * diameter is angular room those sectors need. At the far end, 47 sectors on a
 * 360px wheel still leaves about 23px of label circle each, which a two-digit
 * number at 10px fits inside; the numbered list underneath is what actually
 * keeps a crowded wheel readable.
 */
const MAX_SIZE = 360;

/**
 * Size falls back to MAX_SIZE until the first layout pass reports something
 * narrower, rather than rendering nothing while it waits — and that is
 * load-bearing twice over. `onLayout` never fires under React Native Testing
 * Library, which has no layout engine, so a component gated on measurement is
 * invisible to every render test (the app's other SVG surface, TrendChart, is
 * gated that way and has no test at all). And on the web the first paint happens
 * before the ResizeObserver fires, so the fallback is what is briefly on screen:
 * the `viewBox` below is what makes an oversized fallback scale into its column
 * instead of overflowing it.
 */
const clampSize = (width) => (width > 0 ? Math.min(width, MAX_SIZE) : MAX_SIZE);

const AlignmentWheel = ({ sectors, previousScores, accessibilityLabel }) => {
  const { colors, mode } = useThemeColors();
  const [width, setWidth] = useState(0);

  // react-native-svg draws text in user units and has no `allowFontScaling`, so
  // the sector numbers are the one piece of type in the app that would ignore the
  // reader's OS text size. Scaled here by hand, and the room reserved for them
  // scales with it or a larger number would be drawn off the edge of the canvas.
  const fontScale = PixelRatio.getFontScale();
  const numberSize = NUMBER_SIZE * fontScale;
  const labelRoom = Math.round(numberSize * 1.8);

  const size = clampSize(width);
  const centre = size / 2;
  const radius = Math.max(0, centre - labelRoom);
  const count = sectors.length;

  const rings = useMemo(() => ringRadii(radius, ALIGNMENT_RINGS), [radius]);

  const outline = useMemo(() => (previousScores
    ? outlinePath(centre, centre, radius, count, (index) => previousScores.get(sectors[index].valueId))
    : ''), [previousScores, sectors, count, centre, radius]);

  // Nothing to draw, or nowhere to draw it: a container narrower than the label
  // room leaves a negative radius, which jest renders happily and a browser
  // rejects outright.
  if (count === 0 || radius <= 0) return null;

  // One sector spans the whole turn, so it is a circle rather than a wedge — and
  // so is its previous-check-in outline, which the shared path builder declines
  // to draw for the same reason.
  const isSingle = wheelSectorShape(count) === 'circle';
  const singlePrevious = isSingle && previousScores
    ? alignmentFraction(previousScores.get(sectors[0].valueId))
    : 0;

  return (
    <View
      style={styles.container}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      testID="alignment-wheel"
      // `accessible` as well as the role: a View is not an accessibility element
      // without it, and on iOS the label would simply never be announced —
      // leaving an SVG with no semantics at all. The list below the wheel carries
      // every name and score, so a summary is all this needs to be.
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={styles.svg}
        testID="alignment-wheel-svg"
      >
        {/* The disc, in the SURFACE colour rather than the track colour, and the
            difference is not cosmetic. `track` means "the rest of the range" —
            the unfilled half of a bar — and on this chart the centre is a
            position with a meaning of its own: "my behaviour does not correspond
            to this value". A sector nobody has answered yet would then be drawn
            in exactly the ink that says they answered it as badly as possible,
            which on every day before the reader checks in is most of the wheel.
            Paper, instead: an unanswered sector is blank, and only a score puts
            ink on it. */}
        <Circle cx={centre} cy={centre} r={radius} fill={colors.surface} />

        {sectors.map((sector, index) => {
          const fraction = alignmentFraction(sector.score);
          if (fraction <= 0) return null;
          const fill = priorityColor(alignmentBand(sector.score).id, mode);
          const r = radius * fraction;

          return isSingle ? (
            <Circle
              key={sector.valueId}
              cx={centre}
              cy={centre}
              r={round(r)}
              fill={fill}
              testID={`alignment-sector-${sector.key}`}
            />
          ) : (
            <Path
              key={sector.valueId}
              d={wedgePath(
                centre, centre, r,
                boundaryAngle(index, count), boundaryAngle(index + 1, count),
              )}
              fill={fill}
              testID={`alignment-sector-${sector.key}`}
            />
          );
        })}

        {/* The ring grid sits ON TOP of the fills, as it does on the paper
            version: it is what lets a reader count the rings a sector reaches
            rather than judge a length by eye. A muted stroke at low opacity is
            legible over the pale disc and over a saturated fill, in both colour
            schemes — a border-coloured line is not. */}
        <G>
          {rings.map((r, i) => (
            <Circle
              key={`ring-${i}`}
              cx={centre}
              cy={centre}
              r={round(r)}
              fill="none"
              stroke={colors.mutedText}
              strokeOpacity={i === rings.length - 1 ? 0.55 : 0.35}
              strokeWidth={1}
              testID={`alignment-ring-${i + 1}`}
            />
          ))}
        </G>

        {/* Sector dividers, drawn above the fills so two neighbours in the same
            colour band never merge into one shape. A single sector has no
            neighbour to be divided from, and one radius drawn across a full
            circle would just be a stray line. */}
        {!isSingle && sectors.map((sector, index) => {
          const [x, y] = pointAt(centre, centre, boundaryAngle(index, count), radius);
          return (
            <Line
              key={`divider-${sector.valueId}`}
              x1={centre}
              y1={centre}
              x2={round(x)}
              y2={round(y)}
              stroke={colors.mutedText}
              strokeOpacity={0.55}
              strokeWidth={1}
            />
          );
        })}

        {!!outline && (
          <Path
            d={outline}
            fill="none"
            stroke={colors.text}
            strokeOpacity={0.7}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
            testID="alignment-previous-outline"
          />
        )}

        {singlePrevious > 0 && (
          <Circle
            cx={centre}
            cy={centre}
            r={round(radius * singlePrevious)}
            fill="none"
            stroke={colors.text}
            strokeOpacity={0.7}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            testID="alignment-previous-outline"
          />
        )}

        {/* Sector numbers, outside the disc at each sector's mid-angle. Outside
            rather than inside because a sector's inner end is a sliver: at eight
            sectors a number fits in it, at twenty-five it does not, and the
            reader should not lose the labels for having many values they care
            about. The vertical centring is done by hand rather than with a
            baseline attribute, whose support differs between react-native-svg and
            the browser it compiles to. */}
        {sectors.map((sector, index) => {
          const mid = (boundaryAngle(index, count) + boundaryAngle(index + 1, count)) / 2;
          const [x, y] = pointAt(centre, centre, mid, radius + labelRoom / 2 + 1);
          return (
            <SvgText
              key={`number-${sector.valueId}`}
              x={round(x)}
              y={round(y + numberSize * 0.35)}
              fill={colors.mutedText}
              fontSize={numberSize}
              textAnchor="middle"
            >
              {String(sector.sector)}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  svg: {
    maxWidth: '100%',
  },
});

AlignmentWheel.propTypes = {
  /** [{ valueId, key, sector, score }] — strongest-first, sector 1 at twelve o'clock. */
  sectors: PropTypes.arrayOf(PropTypes.shape({
    valueId: PropTypes.string.isRequired,
    key: PropTypes.string.isRequired,
    sector: PropTypes.number.isRequired,
    score: PropTypes.number,
  })).isRequired,
  /**
   * Map of valueId → score from the previous check-in, drawn as a dashed
   * outline. Keyed by value and never by position: two check-ins routinely cover
   * different value sets, and a sector the earlier one never answered is a gap in
   * the outline rather than a step at zero.
   */
  previousScores: PropTypes.instanceOf(Map),
  accessibilityLabel: PropTypes.string,
};

export default AlignmentWheel;
