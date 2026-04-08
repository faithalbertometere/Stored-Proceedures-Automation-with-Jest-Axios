module.exports = {
  rootDir:         '../', 
  testEnvironment: 'node',
  testTimeout:     120000,
  testMatch:       require('./testpaths/manageOverdraft'),
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './reports',
        filename:   'test-report.html',
        pageTitle:  'Smart Overdraft — Manage Overdraft Test Results',
        expand:     true,
        hideIcon:   false,
      },
    ],
  ],
};