import React from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { DESTRUCTIVE } from '../styles/semanticColors';
import { SPACING, FONT_SIZE, BORDER_RADIUS } from '../styles/designTokens';

/**
 * Last line of defence around the whole tree.
 *
 * Its styling comes from module-scope constants rather than from ThemeColors:
 * this component renders precisely *because* something below it threw, and the
 * provider it would read from lives in that same tree. English strings for the
 * same reason — LocalizationProvider may be exactly what failed.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Unhandled error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container} testID="error-boundary">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. Your saved calibrations are untouched.
        </Text>
        <ScrollView style={styles.detailBox}>
          <Text style={styles.detail}>{String(error?.message || error)}</Text>
        </ScrollView>
        <Button mode="contained" onPress={this.handleReset} style={styles.action}>
          Try again
        </Button>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  action: {
    marginTop: SPACING.xl,
  },
  body: {
    color: '#444444',
    fontSize: FONT_SIZE.base,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  detail: {
    color: DESTRUCTIVE.light,
    fontSize: FONT_SIZE.sm,
  },
  detailBox: {
    backgroundColor: '#f6f6f6',
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.lg,
    maxHeight: 160,
    padding: SPACING.md,
    width: '100%',
  },
  title: {
    color: '#111111',
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
  },
});

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};

export default ErrorBoundary;
