const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Create a temporary directory for downloads
const tempDir = path.join(os.tmpdir(), 'tiktok-downloads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Function to download and install yt-dlp if not already installed
async function ensureYtDlp() {
  try {
    const ytDlpPath = path.join('/tmp', 'yt-dlp');
    
    // Check if yt-dlp already exists
    if (!fs.existsSync(ytDlpPath)) {
      console.log('Installing yt-dlp...');
      
      // Download yt-dlp binary
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(ytDlpPath);
        https.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', response => {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            // Make it executable
            fs.chmodSync(ytDlpPath, '755');
            resolve();
          });
        }).on('error', err => {
          fs.unlink(ytDlpPath, () => {});
          reject(err);
        });
      });
      
      console.log('yt-dlp installed successfully');
    }
    
    return ytDlpPath;
  } catch (error) {
    console.error('Error installing yt-dlp:', error);
    throw error;
  }
}

// Function to download TikTok video using yt-dlp
async function downloadTikTokVideo(url, format = 'video') {
  try {
    console.log(`Starting download for: ${url} in format: ${format}`);
    
    // Generate a unique filename
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const outputPath = path.join(tempDir, `tiktok-${uniqueId}`);
    
    // Ensure yt-dlp is available
    const ytDlpPath = await ensureYtDlp();
    
    // Prepare yt-dlp command based on format
    let ytDlpArgs = [
      '--no-warnings',
      '--no-check-certificate',
      '--prefer-ffmpeg',
      '--geo-bypass',
      '--no-playlist',
      '--quiet',
      '--print', 'filename',
    ];
    
    // Add format-specific arguments
    if (format === 'audio') {
      ytDlpArgs = [
        ...ytDlpArgs,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '-o', `${outputPath}.%(ext)s`,
      ];
    } else if (format === 'hd') {
      ytDlpArgs = [
        ...ytDlpArgs,
        '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '-o', `${outputPath}.%(ext)s`,
      ];
    } else {
      // Default video format
      ytDlpArgs = [
        ...ytDlpArgs,
        '--format', 'best[ext=mp4]/best',
        '-o', `${outputPath}.%(ext)s`,
      ];
    }
    
    // Add the URL as the last argument
    ytDlpArgs.push(url);
    
    console.log(`Running yt-dlp with args: ${ytDlpArgs.join(' ')}`);
    
    // Execute yt-dlp command
    const command = `/tmp/yt-dlp ${ytDlpArgs.join(' ')}`;
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
    
    if (stderr) {
      console.error(`yt-dlp stderr: ${stderr}`);
    }
    
    // Get the output filename from stdout
    const outputFilename = stdout.trim();
    console.log(`Download completed: ${outputFilename}`);
    
    if (!fs.existsSync(outputFilename)) {
      throw new Error(`Downloaded file not found: ${outputFilename}`);
    }
    
    // Read the file and return as base64
    const fileBuffer = fs.readFileSync(outputFilename);
    const base64Data = fileBuffer.toString('base64');
    
    // Determine content type
    let contentType = 'video/mp4';
    if (format === 'audio') {
      contentType = 'audio/mp3';
    }
    
    // Clean up the file
    try {
      fs.unlinkSync(outputFilename);
    } catch (err) {
      console.error(`Error cleaning up file: ${err.message}`);
    }
    
    return {
      success: true,
      data: base64Data,
      contentType,
      filename: path.basename(outputFilename)
    };
  } catch (error) {
    console.error('Error downloading TikTok video:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Function to validate a TikTok URL
function validateTikTokUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    
    // Check if the hostname is a valid TikTok domain
    const validDomains = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com'];
    
    if (!validDomains.includes(hostname)) {
      return false;
    }
    
    // Check if the URL has a valid path structure
    const path = parsedUrl.pathname;
    return path.includes('/video/') || path.match(/\/@[\w.-]+\/video\/\d+/);
  } catch (error) {
    return false;
  }
}

// Main handler function
exports.handler = async function(event, context) {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  
  // Handle OPTIONS request (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }
  
  try {
    // Parse request parameters
    const params = event.queryStringParameters || {};
    const url = params.url;
    const format = params.format || 'video'; // Default to video format
    
    console.log(`Processing request for URL: ${url}, Format: ${format}`);
    
    // Validate URL
    if (!url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL parameter is required' })
      };
    }
    
    if (!validateTikTokUrl(url)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid TikTok URL' })
      };
    }
    
    // Download the video using yt-dlp
    const result = await downloadTikTokVideo(url, format);
    
    if (!result.success) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Download error: Could not download the video. The video might be private or removed.',
          details: result.error
        })
      };
    }
    
    // Return the video data
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        data: result.data,
        contentType: result.contentType,
        filename: result.filename
      })
    };
  } catch (error) {
    console.error('Error in handler:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Server error: An unexpected error occurred',
        details: error.message
      })
    };
  }
};
