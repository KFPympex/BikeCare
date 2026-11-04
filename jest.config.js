module.exports = {
  // Con --coverage se miden todos estos archivos; los no probados aparecen con 0 %.
  collectCoverageFrom: ['server.js', 'public/*.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json', 'json-summary', 'cobertura']
};
