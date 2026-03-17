module.exports = {
  rootDir:         '../', 
  testEnvironment: 'node',
  testTimeout:     120000,
  testMatch:       require('./testPaths/interestAccrual'),
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './reports',
        filename:   'test-report.html',
        pageTitle:  'Smart Overdraft — SmartOD Interest Accrual Test Results',
        expand:     true,
        hideIcon:   false,
      },
    ],
  ],
};