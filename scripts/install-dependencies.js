const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create log function
function log(message) {
  console.log(`[Setup] ${message}`);
}

// Main function
async function main() {
  log('Starting setup...');
  
  try {
    // Create netlify functions directory if it doesn't exist
    const functionsDir = path.join(process.cwd(), 'netlify', 'functions');
    if (!fs.existsSync(functionsDir)) {
      log('Creating Netlify functions directory...');
      fs.mkdirSync(functionsDir, { recursive: true });
    }
    
    // Fix any ESLint issues
    log('Fixing ESLint issues...');
    try {
      execSync('npm run lint -- --fix', { stdio: 'inherit' });
    } catch (error) {
      log('Warning: ESLint fix failed, but continuing with build');
    }
    
    log('Setup completed successfully!');
  } catch (error) {
    log(`Error during setup: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
