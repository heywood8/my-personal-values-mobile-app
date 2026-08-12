module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|drizzle-orm|drizzle-kit|invariant)|@unimodules|unimodules|native-base|react-native-svg)/',
  ],
  coverageReporters: [
    'json-summary',
    'text',
    'lcov',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.claude/',
  ],
  // drizzle/ is generated: the migration module is a list of SQL strings with no
  // branches to cover, and reporting it drags the average around for no signal.
  // What actually needs checking there — that the SQL still matches the schema —
  // is asserted directly in __tests__/db/schema.test.js.
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/drizzle/',
  ],
  moduleNameMapper: {
    '^expo$': '<rootDir>/node_modules/expo',
    '^expo/(.*)$': '<rootDir>/node_modules/expo/$1',
  },
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
  },
};
