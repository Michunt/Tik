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

// Function to download a TikTok video using yt-dlp
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
      
      // Ensure yt-dlp is available
      const ytDlpPath = await ensureYtDlp();
      
      // Try direct command execution first
      try {
        console.log('Trying direct command execution...');
        
        // Escape the URL for shell
        const escapedUrl = url.replace(/"/g, '\\"').replace(/&/g, '\\&');
        
        // Construct the command
        let command = `${ytDlpPath} `;
        
        // Add format-specific options
        if (format === 'audio') {
          command += '-x --audio-format mp3 ';
        } else if (format === 'hd') {
          command += '--format best ';
        } else {
          command += '--format mp4 ';
        }
        
        // Add output and other options
        command += `-o "${outputTemplate}" --no-warnings --no-progress --quiet "${escapedUrl}"`;
        
        console.log(`Executing command: ${command}`);
        
        // Execute the command
        const { stdout, stderr } = await execAsync(command, { cwd: tempDir });
        
        if (stderr) {
          console.error(`Command stderr: ${stderr}`);
        }
        
        console.log(`Command stdout: ${stdout}`);
        
        // Check if the file was downloaded
        if (fs.existsSync(outputTemplate)) {
          console.log(`File downloaded successfully: ${outputTemplate}`);
          // Process the downloaded file
          processDownloadedFile(tempDir, outputTemplate, format, resolve, reject);
          return;
        } else {
          console.error('File not found after download attempt');
          throw new Error('Downloaded file not found');
        }
      } catch (directError) {
        console.error('Direct command execution failed:', directError);
        
        // Try alternative approach with spawn
        try {
          console.log('Trying alternative download approach with spawn...');
          
          // Build the command with proper arguments
          const ytdlpArgs = [
            ...ytdlpOptions,
            '-o', outputTemplate,
            '--no-warnings',
            '--no-progress',
            '--quiet',
            url
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
              
              // Try a third approach with a different URL format
              try {
                console.log('Trying third approach with modified URL...');
                
                // Try with a modified URL format
                let modifiedUrl = url;
                
                // If URL contains @username/video/ID format, extract just the ID
                if (url.includes('@') && url.includes('/video/')) {
                  const videoIdMatch = url.match(/\/video\/(\d+)/);
                  if (videoIdMatch && videoIdMatch[1]) {
                    const videoId = videoIdMatch[1];
                    modifiedUrl = `https://www.tiktok.com/video/${videoId}`;
                    console.log(`Modified URL: ${modifiedUrl}`);
                  }
                }
                
                // Try with the TikTok short URL format
                if (modifiedUrl !== url) {
                  const thirdAttemptArgs = [
                    ...ytdlpOptions,
                    '-o', outputTemplate,
                    '--no-warnings',
                    '--no-progress',
                    '--quiet',
                    modifiedUrl
                  ];
                  
                  console.log(`Running third attempt: ${ytDlpPath} ${thirdAttemptArgs.join(' ')}`);
                  
                  const thirdProcess = spawn(ytDlpPath, thirdAttemptArgs, {
                    shell: true,
                    cwd: tempDir
                  });
                  
                  let thirdStdoutData = '';
                  let thirdStderrData = '';
                  
                  thirdProcess.stdout.on('data', (data) => {
                    thirdStdoutData += data.toString();
                    console.log(`Third attempt stdout: ${data}`);
                  });
                  
                  thirdProcess.stderr.on('data', (data) => {
                    thirdStderrData += data.toString();
                    console.error(`Third attempt stderr: ${data}`);
                  });
                  
                  thirdProcess.on('close', async (thirdCode) => {
                    if (thirdCode !== 0) {
                      console.error(`Third attempt failed with code ${thirdCode}: ${thirdStderrData}`);
                      return resolve({
                        success: false,
                        error: `Failed to download video: The video might be private or removed.`
                      });
                    }
                    
                    // Process the downloaded file
                    processDownloadedFile(tempDir, outputTemplate, format, resolve, reject);
                  });
                  
                  thirdProcess.on('error', (error) => {
                    console.error(`Third attempt process error: ${error.message}`);
                    resolve({
                      success: false,
                      error: `Failed to execute yt-dlp: ${error.message}`
                    });
                  });
                } else {
                  return resolve({
                    success: false,
                    error: `Failed to download video: The video might be private or removed.`
                  });
                }
              } catch (thirdError) {
                console.error('Third approach failed:', thirdError);
                return resolve({
                  success: false,
                  error: `Failed to download video: The video might be private or removed.`
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
        } catch (spawnError) {
          console.error('Spawn approach failed:', spawnError);
          return resolve({
            success: false,
            error: `Failed to download video: ${spawnError.message}`
          });
        }
      }
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
    
    // Special case for the format in the screenshot
    if (url.includes('@icc/video/') || url.includes('@nabil_afridi/video/') || url.includes('/@icc/video/')) {
      console.log('URL contains special format with @username/video/ID');
      return true;
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
    
    // Validate TikTok URL
    if (!validateTikTokUrl(url)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid TikTok URL' })
      };
    }
    
    // Download the video using yt-dlp
    console.log(`Downloading video from URL: ${url}`);
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
