const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine platform-specific commands and paths
const isWindows = os.platform() === 'win32';
const isNetlify = process.env.NETLIFY === 'true';

console.log('Running install-dependencies.js');
console.log('Platform:', os.platform());
console.log('Is Netlify environment:', isNetlify);

// Create a bin directory in the project root for executables
const binDir = path.join(process.cwd(), 'bin');
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
  console.log('Created bin directory:', binDir);
}

// Install yt-dlp
try {
  if (isNetlify) {
    // On Netlify (Linux environment)
    console.log('Installing yt-dlp on Netlify...');
    
    // Download yt-dlp binary
    execSync('curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp');
    
    // Make it executable
    execSync('chmod +x bin/yt-dlp');
    
    console.log('yt-dlp installed successfully in bin directory');
    
    // Create a symlink to make it available in PATH
    execSync('mkdir -p node_modules/.bin');
    execSync('ln -sf ../../bin/yt-dlp node_modules/.bin/yt-dlp');
    console.log('Created symlink to yt-dlp in node_modules/.bin');
    
    // Install FFmpeg
    console.log('Installing FFmpeg...');
    execSync('apt-get update && apt-get install -y ffmpeg');
    console.log('FFmpeg installed via apt-get');
  } else {
    console.log('Not running on Netlify, skipping yt-dlp installation');
    // For local development, users should install yt-dlp manually
    // This script will only run the installation on Netlify
  }
} catch (error) {
  console.error('Error installing dependencies:', error.message);
  process.exit(1);
}

// Update environment variables in .env file for Netlify
if (isNetlify) {
  const envPath = path.join(process.cwd(), '.env');
  const envContent = `
FFMPEG_PATH=ffmpeg
YT_DLP_PATH=${path.join(process.cwd(), 'bin', 'yt-dlp')}
  `.trim();
  
  fs.writeFileSync(envPath, envContent);
  console.log('Created .env file with paths:', envPath);
  console.log(envContent);
}

console.log('Dependencies installation completed successfully');
