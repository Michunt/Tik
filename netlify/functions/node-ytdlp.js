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
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Create a temporary directory for downloads
const tempDir = path.join(os.tmpdir(), 'tiktok-downloads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Function to ensure yt-dlp is available
async function ensureYtDlp() {
  try {
    // Path to yt-dlp in the Lambda environment
    const ytDlpPath = path.join(process.env.LAMBDA_TASK_ROOT || '/tmp', 'yt-dlp');
    
    // Check if yt-dlp exists
    if (!fs.existsSync(ytDlpPath)) {
      console.log('yt-dlp not found, downloading...');
      
      // Download yt-dlp
      const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
      const response = await fetch(ytDlpUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download yt-dlp: ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(ytDlpPath, Buffer.from(buffer));
      
      // Make yt-dlp executable
      fs.chmodSync(ytDlpPath, '755');
      console.log('yt-dlp downloaded and made executable');
    } else {
      console.log('yt-dlp already exists');
    }
    
    // Verify yt-dlp is executable
    try {
      const { stdout } = await execAsync(`${ytDlpPath} --version`);
      console.log(`yt-dlp version: ${stdout.trim()}`);
    } catch (error) {
      console.error('Error verifying yt-dlp:', error);
      // If verification fails, try to make it executable again
      fs.chmodSync(ytDlpPath, '755');
    }
    
    return ytDlpPath;
  } catch (error) {
    console.error('Error ensuring yt-dlp:', error);
    throw error;
  }
}

// Function to download TikTok video using yt-dlp
async function downloadTikTokVideo(url, format = 'video') {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`Starting download for URL: ${url}, Format: ${format}`);
      
      // Create a temporary directory for the download
      const tempDir = path.join(os.tmpdir(), 'tiktok-download-' + Date.now());
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Determine the output format and options based on the requested format
      let outputFormat = 'mp4';
      let ytdlpOptions = [];
      
      switch (format.toLowerCase()) {
        case 'audio':
          outputFormat = 'mp3';
          ytdlpOptions = ['-x', '--audio-format', 'mp3'];
          break;
        case 'hd':
          ytdlpOptions = ['--format', 'best'];
          break;
        default: // video
          ytdlpOptions = ['--format', 'mp4'];
      }
      
      // Set the output template
      const outputTemplate = path.join(tempDir, 'video.' + outputFormat);
      
      // Properly quote the URL to handle special characters
      const quotedUrl = `"${url.replace(/"/g, '\\"')}"`;
      
      // Construct the yt-dlp command
      // Note: We're using double quotes around the URL to handle special characters
      const ytDlpPath = await ensureYtDlp();
      
      // Build the command with proper arguments
      const ytdlpArgs = [
        ...ytdlpOptions,
        '-o', outputTemplate,
        '--no-warnings',
        '--no-progress',
        '--quiet',
        quotedUrl
      ];
      
      console.log(`Running command: ${ytDlpPath} ${ytdlpArgs.join(' ')}`);
      
      // Execute yt-dlp as a child process
      const ytdlpProcess = spawn(ytDlpPath, ytdlpArgs, {
        shell: true, // Use shell to handle the quoted URL properly
        cwd: tempDir
      });
      
      let stdoutData = '';
      let stderrData = '';
      
      ytdlpProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        console.log(`yt-dlp stdout: ${data}`);
      });
      
      ytdlpProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        console.error(`yt-dlp stderr: ${data}`);
      });
      
      ytdlpProcess.on('close', async (code) => {
        console.log(`yt-dlp process exited with code ${code}`);
        
        if (code !== 0) {
          console.error(`yt-dlp error: ${stderrData}`);
          
          // Try an alternative approach if the first one fails
          try {
            console.log('Trying alternative download approach...');
            
            // Alternative approach: Use a different set of options
            const alternativeArgs = [
              '--format', 'best',
              '-o', outputTemplate,
              '--no-warnings',
              '--no-progress',
              '--quiet',
              quotedUrl
            ];
            
            console.log(`Running alternative command: ${ytDlpPath} ${alternativeArgs.join(' ')}`);
            
            const alternativeProcess = spawn(ytDlpPath, alternativeArgs, {
              shell: true,
              cwd: tempDir
            });
            
            let altStdoutData = '';
            let altStderrData = '';
            
            alternativeProcess.stdout.on('data', (data) => {
              altStdoutData += data.toString();
              console.log(`Alternative yt-dlp stdout: ${data}`);
            });
            
            alternativeProcess.stderr.on('data', (data) => {
              altStderrData += data.toString();
              console.error(`Alternative yt-dlp stderr: ${data}`);
            });
            
            alternativeProcess.on('close', async (altCode) => {
              if (altCode !== 0) {
                console.error(`Alternative download failed with code ${altCode}: ${altStderrData}`);
                return resolve({
                  success: false,
                  error: `Failed to download video: ${altStderrData || stderrData}`
                });
              }
              
              // Process the downloaded file
              processDownloadedFile(tempDir, outputTemplate, format, resolve, reject);
            });
          } catch (altError) {
            console.error('Alternative download approach failed:', altError);
            return resolve({
              success: false,
              error: `Failed to download video: ${altError.message}`
            });
          }
        } else {
          // Process the downloaded file
          processDownloadedFile(tempDir, outputTemplate, format, resolve, reject);
        }
      });
      
      ytdlpProcess.on('error', (error) => {
        console.error(`yt-dlp process error: ${error.message}`);
        resolve({
          success: false,
          error: `Failed to execute yt-dlp: ${error.message}`
        });
      });
      
    } catch (error) {
      console.error('Error in downloadTikTokVideo:', error);
      resolve({
        success: false,
        error: `Failed to download video: ${error.message}`
      });
    }
  });
}

// Function to process the downloaded file
function processDownloadedFile(tempDir, outputTemplate, format, resolve, reject) {
  try {
    // Read the file and return as base64
    const fileBuffer = fs.readFileSync(outputTemplate);
    const base64Data = fileBuffer.toString('base64');
    
    // Determine content type
    let contentType = 'video/mp4';
    if (format === 'audio') {
      contentType = 'audio/mp3';
    }
    
    // Clean up the file
    try {
      fs.unlinkSync(outputTemplate);
    } catch (err) {
      console.error(`Error cleaning up file: ${err.message}`);
    }
    
    // Remove the temporary directory
    fs.rmdirSync(tempDir, { recursive: true });
    
    resolve({
      success: true,
      data: base64Data,
      contentType,
      filename: path.basename(outputTemplate)
    });
  } catch (error) {
    console.error('Error processing downloaded file:', error);
    resolve({
      success: false,
      error: `Failed to process downloaded file: ${error.message}`
    });
  }
}

// Function to validate a TikTok URL
function validateTikTokUrl(url) {
  try {
    console.log(`Validating URL: ${url}`);
    
    // Basic URL format check
    if (!url || typeof url !== 'string') {
      console.log('Invalid URL: URL is empty or not a string');
      return false;
    }
    
    // Handle shortened URLs or URLs without protocol
    if (url.startsWith('vm.tiktok.com') || url.startsWith('tiktok.com')) {
      url = 'https://' + url;
    }
    
    // Try to parse the URL
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    
    // Check if the hostname is a valid TikTok domain
    const validDomains = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com'];
    
    if (!validDomains.includes(hostname)) {
      console.log(`Invalid domain: ${hostname}`);
      return false;
    }
    
    // Check if the URL has a valid path structure
    const path = parsedUrl.pathname;
    console.log(`URL path: ${path}`);
    
    // Extract video ID using regex - handle multiple formats
    // 1. Standard format: /@username/video/1234567890
    // 2. Direct format: /video/1234567890
    // 3. Special format: /@icc/video/7474632974
    const videoIdRegex = /\/video\/(\d+)|@[\w.-]+\/video\/(\d+)/;
    const match = path.match(videoIdRegex);
    
    if (match) {
      const videoId = match[1] || match[2];
      console.log(`Valid TikTok URL. Video ID: ${videoId}`);
      return true;
    }
    
    console.log('No video ID found in URL path');
    return false;
  } catch (error) {
    console.error('Error validating TikTok URL:', error);
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
    
    // Special handling for the specific URL format
    let processedUrl = url;
    // If URL contains @username/video/ID format, ensure it's properly formatted
    if (url.includes('@') && url.includes('/video/')) {
      console.log('URL contains @username/video/ID format');
      
      // Extract the video ID
      const videoIdMatch = url.match(/\/video\/(\d+)/) || url.match(/@[\w.-]+\/video\/(\d+)/);
      if (videoIdMatch) {
        const videoId = videoIdMatch[1] || videoIdMatch[2];
        console.log(`Extracted video ID: ${videoId}`);
        
        // Ensure the URL is in the correct format
        processedUrl = `https://www.tiktok.com/video/${videoId}`;
        console.log(`Processed URL: ${processedUrl}`);
      }
    }
    
    if (!validateTikTokUrl(processedUrl)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid TikTok URL' })
      };
    }
    
    // Download the video using yt-dlp
    console.log(`Downloading video from URL: ${processedUrl}`);
    const result = await downloadTikTokVideo(processedUrl, format);
    
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
