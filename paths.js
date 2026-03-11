const fs = require('fs');
const path = require('path');

// In the new architecture, we respect the API_TARGET_DIR env var predominantly.
// If it's not set, we shouldn't really guess.

const TARGET_DIR = process.env.API_TARGET_DIR || process.cwd();

const hasSrcFolder = fs.existsSync(path.join(TARGET_DIR, 'src'));
const API_SERVICES_RELATIVE_DIR = hasSrcFolder ? path.join('src', 'api-services') : 'api-services';

module.exports = {
    PROJECT_ROOT: TARGET_DIR,
    API_SERVICES_RELATIVE_DIR,
    API_SERVICES_DIR: path.join(TARGET_DIR, API_SERVICES_RELATIVE_DIR),
    API_DEFINITIONS_DIR: path.join(TARGET_DIR, API_SERVICES_RELATIVE_DIR, 'definitions'),
    CLIENT_CONFIG_DIR: path.join(TARGET_DIR, hasSrcFolder ? 'src' : '.', 'config'),
};
