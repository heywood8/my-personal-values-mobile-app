/**
 * Minimal event emitter for coordinating across React contexts — mainly telling
 * data providers to reload after something else wrote to the database.
 */

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);

    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter(l => l !== listener);
    };
  }

  emit(event, data) {
    if (!this.events[event]) {
      return;
    }
    this.events[event].forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  off(event, listener) {
    if (!this.events[event]) {
      return;
    }
    this.events[event] = this.events[event].filter(l => l !== listener);
  }
}

export const appEvents = new EventEmitter();

export const EVENTS = {
  DATABASE_RESET: 'database:reset',
  // An assessment was saved or completed — Results and History both reload.
  ASSESSMENTS_CHANGED: 'assessments:changed',
  // The catalogue changed (a value archived, restored, or added).
  VALUES_CHANGED: 'values:changed',
  // Ask the shell to open the calibration flow (from the Results empty state,
  // the History screen, or Settings).
  START_CALIBRATION: 'navigate:calibration',
};
