import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalization } from '../contexts/LocalizationContext';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import ResultsScreen from '../screens/ResultsScreen';
import AlignmentScreen from '../screens/AlignmentScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { appEvents, EVENTS } from '../services/eventEmitter';
import {
  SPACING, FONT_SIZE, HEIGHTS, BORDER_RADIUS, LETTER_SPACING, elevation,
} from '../styles/designTokens';

/**
 * Alignment sits directly after Values, because it is derived from it: the wheel
 * only has sectors for what the ranking put at the top. History follows both,
 * since it reads across time rather than across values.
 */
const TABS = [
  { key: 'results', icon: 'scale-balance', labelKey: 'tab_results' },
  { key: 'alignment', icon: 'target', labelKey: 'tab_alignment' },
  { key: 'history', icon: 'chart-line-variant', labelKey: 'tab_history' },
  { key: 'settings', icon: 'cog-outline', labelKey: 'tab_settings' },
];

/**
 * Three tabs, hand-rolled.
 *
 * React Navigation would be the reflex, but it is a large dependency whose value
 * is stacks, deep links and gesture-driven transitions — none of which this app
 * has. Three sibling screens and no navigation history is a `useState`, and
 * keeping it one means one fewer thing that behaves differently on web.
 */
const SimpleTabs = ({ onStartCalibration }) => {
  const { t } = useLocalization();
  const { colors, mode } = useThemeColors();
  const [active, setActive] = useState('results');

  // The empty states and the settings button all raise the same event rather
  // than each holding a reference to the calibration flow.
  useEffect(() => appEvents.on(EVENTS.START_CALIBRATION, () => {
    onStartCalibration();
  }), [onStartCalibration]);

  const startCalibration = useCallback(() => {
    onStartCalibration();
  }, [onStartCalibration]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        {active === 'results' && <ResultsScreen onStartCalibration={startCalibration} />}
        {active === 'alignment' && <AlignmentScreen onStartCalibration={startCalibration} />}
        {active === 'history' && <HistoryScreen onStartCalibration={startCalibration} />}
        {active === 'settings' && <SettingsScreen onStartCalibration={startCalibration} />}
      </View>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.surface }}>
        <View
          style={[
            styles.tabBar,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
            elevation(3, mode),
          ]}
        >
          {TABS.map((tab) => {
            const selected = active === tab.key;
            const tint = selected ? colors.primary : colors.mutedText;

            return (
              <Pressable
                key={tab.key}
                onPress={() => setActive(tab.key)}
                accessibilityRole="tab"
                aria-selected={selected}
                accessibilityLabel={t(tab.labelKey)}
                testID={`tab-${tab.key}`}
                style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
              >
                {/* The pill is what says "here", and it says it with shape as
                    well as with colour — the tint alone was the whole indicator,
                    which is a claim in hue and nothing else on the one control
                    that is on screen at all times. */}
                <View
                  style={[
                    styles.tabIcon,
                    selected && { backgroundColor: colors.selected },
                  ]}
                >
                  <MaterialCommunityIcons name={tab.icon} size={22} color={tint} />
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: tint },
                    selected && styles.tabLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {t(tab.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
  },
  tabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: HEIGHTS.tabBar,
  },
  tabIcon: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.pill,
    height: 30,
    justifyContent: 'center',
    // Wider than it is tall, which is what makes it read as an indicator sitting
    // under the icon rather than as a button drawn around it.
    width: 56,
  },
  tabLabel: {
    fontSize: FONT_SIZE.xs,
    letterSpacing: LETTER_SPACING.wide,
  },
  tabLabelSelected: {
    fontWeight: '600',
  },
  tabPressed: {
    opacity: 0.6,
  },
});

SimpleTabs.propTypes = {
  onStartCalibration: PropTypes.func.isRequired,
};

export default SimpleTabs;
