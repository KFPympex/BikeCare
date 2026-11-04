module.exports = {
  // Con --coverage se miden todos estos archivos; los no probados aparecen con 0 %.
  collectCoverageFrom: ['server.js', 'public/*.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json', 'json-summary', 'cobertura'],
  // Reporte de pruebas en XML (JUnit): se guarda como artefacto en GitHub Actions.
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports', outputName: 'junit.xml' }]]
};