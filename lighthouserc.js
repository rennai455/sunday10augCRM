module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3002/static/Login.html',
        'http://localhost:3002/static/dashboard.html'
      ],
      numberOfRuns: 1,
      budgetsPath: 'lighthouse-budgets.json'
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', {minScore: 0.7}],
        'categories:accessibility': ['warn', {minScore: 0.7}],
        'categories:best-practices': ['warn', {minScore: 0.7}],
        'categories:seo': ['warn', {minScore: 0.7}]
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
};
