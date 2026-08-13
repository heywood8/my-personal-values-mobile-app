import React, { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, PixelRatio } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { valueName, valueDescription } from '../utils/valueNames';
import { FONT_SIZE, SPACING } from '../styles/designTokens';

// The description's line box at the system font size. React Native scales a
// fontSize with the reader's font-size setting but leaves a lineHeight in a
// stylesheet exactly where it was written, so this is a base to multiply rather
// than a value to use: at 200% it would be 32px of text in a 22px line, which
// prints the description on top of itself. One line is also what "+1 line" adds
// on top of the tallest card in the deck.
const DESC_LINE_HEIGHT = 22;

/**
 * The name and description at the top of a calibration card, held at one height
 * for the whole deck.
 *
 * Descriptions run from one line to four, so laying the card out naturally moves
 * the rating buttons up and down between cards: the button under the thumb on one
 * card is a different answer on the next, and 47 cards of that is a deck you have
 * to re-aim at every time. So the text block reserves the height of the tallest
 * card in the deck plus one line, and every card's buttons land in the same place.
 *
 * The height is measured rather than guessed. Line count depends on the width,
 * the language and the reader's font scale, none of which are known here, so the
 * whole deck's text is laid out once in a zero-height clipped layer and the
 * tallest result is what gets reserved. That is also what makes "always fits" true
 * rather than hoped for — the reservation is a `minHeight`, so a card that somehow
 * outgrows it still prints in full, it just moves the buttons the way they moved
 * before.
 *
 * Measuring is gated on a real width, so it costs nothing until the card has been
 * laid out, and the layer unmounts as soon as the deck has been through it. A new
 * width, a language switch or a change of font scale invalidates the measurement
 * and it runs again.
 */
const DeckCardText = ({ deck, value }) => {
  const { t, language } = useLocalization();
  const { colors } = useThemeColors();
  const [width, setWidth] = useState(0);
  const [reserved, setReserved] = useState({ height: 0, key: null });
  const tallyRef = useRef(null);

  const fontScale = PixelRatio.getFontScale();
  const lineHeight = Math.round(DESC_LINE_HEIGHT * fontScale);

  // What the measurement is only valid for. Anything here changing rewraps the
  // text, so the reserved height has to be found again.
  const key = `${language}|${width}|${deck.length}|${fontScale}`;

  const handleWidth = useCallback((event) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((prev) => (prev === next ? prev : next));
  }, []);

  const handleCardMeasured = useCallback((index, height) => {
    let tally = tallyRef.current;
    if (!tally || tally.key !== key) {
      tally = { heights: new Map(), key };
      tallyRef.current = tally;
    }
    // Keyed by index rather than counted, so a second layout pass for the same
    // card corrects its height instead of ending the measurement early.
    tally.heights.set(index, height);
    if (tally.heights.size < deck.length) return;
    const tallest = Math.max(...tally.heights.values());
    setReserved({ height: Math.ceil(tallest) + lineHeight, key });
  }, [deck.length, key, lineHeight]);

  const measured = reserved.key === key && reserved.height > 0;
  const description = valueDescription(value, t);

  return (
    <View
      onLayout={handleWidth}
      style={[styles.block, measured && { minHeight: reserved.height }]}
      testID="deck-card-text"
    >
      <Text style={[styles.name, { color: colors.text }]}>{valueName(value, t)}</Text>
      {!!description && (
        <Text style={[styles.desc, { color: colors.mutedText, lineHeight }]}>{description}</Text>
      )}

      {width > 0 && !measured && (
        // Absolute so it is out of the card's flow, clipped to zero height so it
        // cannot paint or stretch the scroll view, and left/right pinned so every
        // card wraps at exactly the width the visible one does.
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.measureLayer}
          testID="deck-card-text-measure"
        >
          {deck.map((item, index) => (
            <View
              key={item.id ?? item.key ?? index}
              onLayout={(event) => handleCardMeasured(index, event.nativeEvent.layout.height)}
            >
              <Text style={styles.name}>{valueName(item, t)}</Text>
              {!!valueDescription(item, t) && (
                // The same line height as the visible card, or the measurement
                // is of a block nobody will ever see.
                <Text style={[styles.desc, { lineHeight }]}>{valueDescription(item, t)}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  block: {
    width: '100%',
  },
  desc: {
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.sm,
  },
  measureLayer: {
    height: 0,
    left: 0,
    opacity: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  name: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
  },
});

DeckCardText.propTypes = {
  // Every card the reservation has to cover, not just the one on screen.
  deck: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.object,
};

export default DeckCardText;
