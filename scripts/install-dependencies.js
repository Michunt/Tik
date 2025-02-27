const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// Create log function
function log(message) {
  console.log(`[Setup] ${message}`);
}

// Function to download a file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    log(`Downloading ${url} to ${dest}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        log(`Download of ${dest} completed`);
        resolve();
      });
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
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
    
    // Create tmp directory for executables (Netlify uses /tmp)
    const tmpDir = '/tmp';
    log(`Using tmp directory: ${tmpDir}`);
    
    // Download yt-dlp
    const ytDlpPath = path.join(tmpDir, 'yt-dlp');
    if (!fs.existsSync(ytDlpPath)) {
      log('Downloading yt-dlp...');
      await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', ytDlpPath);
      log('Making yt-dlp executable...');
      fs.chmodSync(ytDlpPath, '755');
    } else {
      log('yt-dlp already exists, skipping download');
    }
    
    // Verify yt-dlp installation
    try {
      log('Verifying yt-dlp installation...');
      const ytDlpVersion = execSync(`${ytDlpPath} --version`, { encoding: 'utf8' }).trim();
      log(`yt-dlp version: ${ytDlpVersion}`);
    } catch (error) {
      log(`Warning: Could not verify yt-dlp installation: ${error.message}`);
    }
    
    // Verify ffmpeg is available (should be pre-installed on Netlify)
    try {
      log('Verifying ffmpeg installation...');
      const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8' }).trim().split('\n')[0];
      log(`ffmpeg version: ${ffmpegVersion}`);
    } catch (error) {
      log(`Warning: ffmpeg not found: ${error.message}`);
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
