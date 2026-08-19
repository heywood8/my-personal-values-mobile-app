import React, { useCallback, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, PixelRatio, Pressable } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { priorityColor } from '../../styles/chartPalette';
import { ALIGNMENT_RINGS, alignmentBand, alignmentFraction } from '../../utils/alignment';
import {
  boundaryAngle, outlinePath, pointAt, ringRadii, round, sectorAt, wedgePath, wheelSectorShape,
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
 * A sector can be POINTED AT: hovering one with a mouse, or tapping it on a
 * phone, marks it and hands its value back to the screen, which is what prints
 * the name and the description — those are sentences too, and they belong beside
 * the captions rather than inside the canvas. The mark is drawn over the whole
 * sector out to the rim, not over its fill, because most of a wheel is
 * unanswered on most days and an unanswered sector has no ink to light up. That
 * is also why the sectors are not pressable shapes: there is nothing there to
 * press. `sectorAt` answers "which sector is this point in" from the geometry,
 * so a blank sector points at itself as readily as a full one.
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

/** How much of the disc's radius a highlighted sector is washed over. */
const HIGHLIGHT_OPACITY = 0.14;

/**
 * Where a pointer landed, in the canvas's own coordinates.
 *
 * Two event families reach the overlay and they name the same number
 * differently: a press carries `locationX` on every platform, while a pointer
 * event — which is how a mouse hover arrives on the web — carries `offsetX`.
 * Both are measured from the top left of the element the event was delivered
 * to, and the overlay is laid over the canvas edge to edge, so either one is
 * already in the coordinates the wheel is drawn in.
 */
const localPoint = ({ nativeEvent }) => [
  nativeEvent.offsetX ?? nativeEvent.locationX,
  nativeEvent.offsetY ?? nativeEvent.locationY,
];

/**
 * Hover is a MOUSE only, deliberately. A touch on a web page emits pointer
 * events as well — including a `pointerleave` the instant the finger lifts —
 * which would wipe the selection the tap had only just made.
 */
const isMouse = ({ nativeEvent }) => nativeEvent.pointerType === 'mouse';

const AlignmentWheel = ({
  sectors, previousScores, accessibilityLabel, activeValueId, onActivate,
}) => {
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

  // Out to the numbers rather than to the rim: a sector's number is printed
  // outside the disc and is part of the sector, not a separate target.
  const hitRadius = radius + labelRoom;

  const pointedAt = useCallback((event) => {
    const [x, y] = localPoint(event);
    // A platform that reports neither coordinate would otherwise resolve to the
    // centre, which is a real sector — better to point at nothing.
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const index = sectorAt(x, y, centre, centre, hitRadius, sectors.length);
    return index < 0 ? null : sectors[index].valueId;
  }, [centre, hitRadius, sectors]);

  // Whether a mouse is over the wheel right now — the one thing a press needs to
  // know about the hover it may or may not be happening under. A ref rather than
  // state: nothing on screen is drawn from it, and re-rendering the canvas on
  // every mouse entry and exit would be a lot of drawing for no picture.
  const hovering = useRef(false);

  const handlePress = useCallback((event) => {
    const valueId = pointedAt(event);
    const marked = !!valueId && valueId === activeValueId;
    // Pressing the sector that is already marked puts it back — on a phone
    // there is no pointer to move away, so the gesture that marked it is the
    // only one there is to unmark it with. Under a mouse it is the opposite: the
    // pointer marked that sector on its way to the click, and clearing it there
    // would blank the panel until the hand twitched and put it straight back.
    onActivate(marked && !hovering.current ? null : valueId);
  }, [pointedAt, onActivate, activeValueId]);

  const handleHover = useCallback((event) => {
    if (!isMouse(event)) return;
    hovering.current = true;
    onActivate(pointedAt(event));
  }, [pointedAt, onActivate]);

  const handleHoverOut = useCallback((event) => {
    if (!isMouse(event)) return;
    hovering.current = false;
    onActivate(null);
  }, [onActivate]);

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

  const activeIndex = sectors.findIndex((sector) => sector.valueId === activeValueId);

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
      <View style={[styles.plot, { height: size, width: size }]}>
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

          {/* The mark on the sector being pointed at: the whole wedge out to the
              rim, washed and outlined in the accent colour. Over the fill rather
              than instead of it, so the score stays readable underneath, and out
              to the rim rather than to the fill's edge, so a sector nobody has
              answered yet is just as markable as a full one — which on most days
              is most of the wheel. */}
          {activeIndex >= 0 && (isSingle ? (
            <Circle
              cx={centre}
              cy={centre}
              r={round(radius)}
              fill={colors.primary}
              fillOpacity={HIGHLIGHT_OPACITY}
              stroke={colors.primary}
              strokeWidth={2}
              testID="alignment-sector-highlight"
            />
          ) : (
            <Path
              d={wedgePath(
                centre, centre, radius,
                boundaryAngle(activeIndex, count), boundaryAngle(activeIndex + 1, count),
              )}
              fill={colors.primary}
              fillOpacity={HIGHLIGHT_OPACITY}
              stroke={colors.primary}
              strokeLinejoin="round"
              strokeWidth={2}
              testID="alignment-sector-highlight"
            />
          ))}

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
            // The number is the legend key, so it is marked with its sector — in
            // weight as well as colour, which is how the rest of the app says
            // "this one" without leaning on hue alone.
            const marked = index === activeIndex;
            return (
              <SvgText
                key={`number-${sector.valueId}`}
                x={round(x)}
                y={round(y + numberSize * 0.35)}
                fill={marked ? colors.primary : colors.mutedText}
                fontSize={numberSize}
                fontWeight={marked ? '700' : '400'}
                textAnchor="middle"
              >
                {String(sector.sector)}
              </SvgText>
            );
          })}
        </Svg>

        {/* The hit layer, a sibling laid OVER the canvas rather than a wrapper
            around it: an event that lands on it is measured from its own top
            left, which is the drawing's origin, whereas one that lands on a
            shape inside the SVG would be measured from that shape. It carries no
            semantics of its own — the wheel is one labelled image, and the
            numbered list below it is what a reader who cannot see it reads. */}
        {!!onActivate && (
          <Pressable
            accessible={false}
            focusable={false}
            onPointerLeave={handleHoverOut}
            onPointerMove={handleHover}
            onPress={handlePress}
            style={StyleSheet.absoluteFill}
            testID="alignment-wheel-hit"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  plot: {
    // Sized to the canvas so the hit layer over it is measured in the same
    // coordinates the wheel is drawn in, and clamped for the same reason the
    // canvas is: before the first layout pass the fallback size can be wider
    // than the column it is standing in.
    maxWidth: '100%',
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
  /** The value whose sector is marked, or null. Owned by the screen, which prints its name. */
  activeValueId: PropTypes.string,
  /**
   * Called with the value id under the pointer, or null for none. Omitting it
   * leaves the wheel a plain drawing with no hit layer over it at all.
   */
  onActivate: PropTypes.func,
};

export default AlignmentWheel;
