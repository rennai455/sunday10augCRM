module.exports = {
  id: 'sunday10augCRM',
  viewports: [
    {
      label: 'desktop',
      width: 1920,
      height: 1080
    }
  ],
  scenarios: [
    {
      label: 'Login',
      url: 'http://localhost:3002/static/Login.html'
    },
    {
      label: 'Dashboard',
      url: 'http://localhost:3002/static/dashboard.html'
    }
  ],
  paths: {
    bitmaps_reference: 'tests/backstop_data/bitmaps_reference',
    bitmaps_test: 'tests/backstop_data/bitmaps_test',
    engine_scripts: 'tests/backstop_data/engine_scripts',
    html_report: 'tests/backstop_data/html_report',
    ci_report: 'tests/backstop_data/ci_report'
  },
  engine: 'playwright',
  report: ['browser', 'CI'],
  debug: false
};
