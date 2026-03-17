module.exports = {
  rootDir:         '../',
  testEnvironment: 'node',
  testTimeout:     120000,
  testMatch:       require('./testPaths/debtBreakdown'),
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './reports',
        filename:   'test-report.html',
        pageTitle:  'Smart Overdraft — Overdraft Breakdown Test Results',
        expand:     true,
        hideIcon:   false,
      },
    ],
  ],
};