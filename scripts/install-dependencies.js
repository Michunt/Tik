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
    
    // Download a static build of FFmpeg for Linux
    console.log('Downloading FFmpeg for Netlify...');
    
    // Create a temporary directory for FFmpeg download
    const ffmpegTempDir = path.join(os.tmpdir(), 'ffmpeg-download');
    if (!fs.existsSync(ffmpegTempDir)) {
      fs.mkdirSync(ffmpegTempDir, { recursive: true });
    }
    
    // Download a static build of FFmpeg
    execSync(`curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ${ffmpegTempDir}/ffmpeg.tar.xz`);
    
    // Extract the archive
    execSync(`tar -xf ${ffmpegTempDir}/ffmpeg.tar.xz -C ${ffmpegTempDir}`);
    
    // Find the extracted directory (it has a version number in the name)
    const ffmpegDirs = fs.readdirSync(ffmpegTempDir).filter(dir => dir.startsWith('ffmpeg-'));
    if (ffmpegDirs.length === 0) {
      throw new Error('Could not find extracted FFmpeg directory');
    }
    
    // Copy the FFmpeg binary to our bin directory
    const ffmpegBinPath = path.join(ffmpegTempDir, ffmpegDirs[0], 'ffmpeg');
    fs.copyFileSync(ffmpegBinPath, path.join(binDir, 'ffmpeg'));
    execSync(`chmod +x ${path.join(binDir, 'ffmpeg')}`);
    
    // Create a symlink to make FFmpeg available in PATH
    execSync(`ln -sf ../../bin/ffmpeg node_modules/.bin/ffmpeg`);
    
    console.log('FFmpeg installed successfully in bin directory');
    
    // Verify FFmpeg is available
    try {
      const ffmpegVersion = execSync(`${path.join(binDir, 'ffmpeg')} -version`).toString().split('\n')[0];
      console.log('FFmpeg version:', ffmpegVersion);
    } catch (error) {
      console.warn('Warning: Could not verify FFmpeg installation, but continuing anyway');
      console.warn('FFmpeg error:', error.message);
    }
  } else {
    console.log('Not running on Netlify, skipping installation');
    // For local development, users should install yt-dlp and FFmpeg manually
  }
} catch (error) {
  console.error('Error installing dependencies:', error.message);
  process.exit(1);
}

// Update environment variables in .env file for Netlify
if (isNetlify) {
  const envPath = path.join(process.cwd(), '.env');
  const envContent = `
FFMPEG_PATH=${path.join(process.cwd(), 'bin', 'ffmpeg')}
YT_DLP_PATH=${path.join(process.cwd(), 'bin', 'yt-dlp')}
  `.trim();
  
  fs.writeFileSync(envPath, envContent);
  console.log('Created .env file with paths:', envPath);
  console.log(envContent);
}

console.log('Dependencies installation completed successfully');
