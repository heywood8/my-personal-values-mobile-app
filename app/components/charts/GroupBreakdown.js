import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { groupColor } from '../../styles/chartPalette';
import { scaleStepLabel } from '../../utils/scales';
import { valueName, groupName } from '../../utils/valueNames';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '../../styles/designTokens';

/**
 * Results grouped by value group: one bar per group at its mean, expandable to
 * the values inside it.
 *
 * Here identity IS the subject — a group means the same thing on this screen, on
 * the trend chart and on the value chips — so this takes the categorical palette
 * rather than the ordinal one the ranked list uses. Group hues are pinned to the
 * group's position in the catalogue, so collapsing or reordering never repaints
 * a group.
 *
 * Every bar prints its group name and mean beside it. That is not only for
 * readability: three of the light-mode categorical slots sit below 3:1 against
 * white, and the palette's relief rule makes visible labels the condition for
 * using them (see styles/chartPalette.js).
 */
const GroupBreakdown = ({ items, groups, scaleId }) => {
  const { colors, mode } = useThemeColors();
  const { t } = useLocalization();
  const [expanded, setExpanded] = useState(null);

  const rows = useMemo(() => {
    const byGroup = new Map();
    for (const item of items) {
      if (!byGroup.has(item.groupKey)) byGroup.set(item.groupKey, []);
      byGroup.get(item.groupKey).push(item);
    }

    return groups
      .map((key, index) => {
        const groupItems = byGroup.get(key) || [];
        if (groupItems.length === 0) return null;
        const mean = groupItems.reduce((sum, i) => sum + i.normalized, 0) / groupItems.length;
        return {
          key,
          index,
          mean,
          // Within a group, strongest first — the reader has already chosen to
          // look inside, so the question changes from "which group" to "what in
          // it matters most".
          items: [...groupItems].sort((a, b) => b.normalized - a.normalized),
        };
      })
      .filter(Boolean)
      // Groups are ordered by their mean so the chart itself is the ranking,
      // while each group's COLOUR stays pinned to its catalogue index.
      .sort((a, b) => b.mean - a.mean);
  }, [items, groups]);

  return (
    <View testID="group-breakdown">
      {rows.map((row) => {
        const color = groupColor(row.index, mode);
        const isOpen = expanded === row.key;

        return (
          <View key={row.key} style={styles.groupBlock}>
            <Pressable
              onPress={() => setExpanded(isOpen ? null : row.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={groupName(row.key, t)}
              testID={`group-row-${row.key}`}
              style={styles.header}
            >
              <View style={styles.headerText}>
                <Text style={[styles.groupName, { color: colors.text }]}>
                  {groupName(row.key, t)}
                </Text>
                <Text style={[styles.groupMeta, { color: colors.mutedText }]}>
                  {`${Math.round(row.mean * 100)}%`}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.mutedText}
              />
            </Pressable>

            <View style={[styles.track, { backgroundColor: colors.track }]}>
              <View
                style={[
                  styles.fill,
                  { backgroundColor: color, width: `${Math.max(2, Math.round(row.mean * 100))}%` },
                ]}
              />
            </View>

            {isOpen && (
              <View style={styles.children}>
                {row.items.map((item) => (
                  <View key={item.valueId} style={styles.childRow}>
                    <View style={[styles.swatch, { backgroundColor: color }]} />
                    <Text
                      numberOfLines={1}
                      style={[styles.childName, { color: colors.text }]}
                    >
                      {valueName(item, t)}
                    </Text>
                    <Text style={[styles.childScore, { color: colors.mutedText }]}>
                      {scaleStepLabel(scaleId, item.score, t)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  childName: {
    flex: 1,
    fontSize: FONT_SIZE.md,
  },
  childRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  childScore: {
    fontSize: FONT_SIZE.sm,
  },
  children: {
    paddingLeft: SPACING.xs,
    paddingTop: SPACING.sm,
  },
  fill: {
    borderBottomRightRadius: BORDER_RADIUS.sm,
    borderTopRightRadius: BORDER_RADIUS.sm,
    height: '100%',
  },
  groupBlock: {
    marginBottom: SPACING.lg,
  },
  groupMeta: {
    fontSize: FONT_SIZE.sm,
  },
  groupName: {
    fontSize: FONT_SIZE.base,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: SPACING.xs,
  },
  headerText: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  swatch: {
    borderRadius: BORDER_RADIUS.sm,
    height: 10,
    width: 10,
  },
  track: {
    borderRadius: BORDER_RADIUS.sm,
    height: 12,
    overflow: 'hidden',
    width: '100%',
  },
});

GroupBreakdown.propTypes = {
  items: PropTypes.array.isRequired,
  groups: PropTypes.array.isRequired,
  scaleId: PropTypes.string.isRequired,
};

export default GroupBreakdown;
