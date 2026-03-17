module.exports = {
    rootDir:         '../', 
    testEnvironment: 'node',
    testTimeout:     120000,
    testMatch:       require('./testPaths/billingStatement'),
    reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './reports',
        filename:   'test-report.html',
        pageTitle:  'Smart Overdraft — Billing Statement Test Results',
        expand:     true,
        hideIcon:   false,
      },
    ],
  ],
};