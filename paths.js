const path = require('path');

// In the new architecture, we respect the API_TARGET_DIR env var predominantly.
// If it's not set, we shouldn't really guess.

const TARGET_DIR = process.env.API_TARGET_DIR || process.cwd();

module.exports = {
    PROJECT_ROOT: TARGET_DIR,
    // Define standard conventions for where generated files go
    // These should match what the Cloud Generator expects/produces
    API_SERVICES_DIR: path.join(TARGET_DIR, 'src', 'api-services'),
    API_DEFINITIONS_DIR: path.join(TARGET_DIR, 'src', 'api-services', 'definitions'),
    CLIENT_CONFIG_DIR: path.join(TARGET_DIR, 'src', 'config'),
};
