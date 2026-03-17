module.exports = {
  rootDir:         '../', 
  testEnvironment: 'node',
  testTimeout:     120000,
  testMatch:       require('./testPaths/debtHistory'),
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './reports',
        filename:   'test-report.html',
        pageTitle:  'Smart Overdraft — OverdraftDebt History Test Results',
        expand:     true,
        hideIcon:   false,
      },
    ],
  ],
};