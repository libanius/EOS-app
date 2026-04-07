/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: './tsconfig.test.json',
    },
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
}

module.exports = config
