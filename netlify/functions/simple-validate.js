const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

// Function to download a file using Node.js https module
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(destination, () => {}); // Delete the file if there was an error
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(destination, () => {}); // Delete the file if there was an error
      reject(err);
    });
  });
}

// Function to run a command and capture its output
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, options);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    
    process.on('error', (err) => {
      reject(err);
    });
  });
}

// Function to download and install yt-dlp if needed
async function ensureYtDlp() {
  const tempDir = os.tmpdir();
  const ytDlpPath = path.join(tempDir, 'yt-dlp');
  
  // Check if yt-dlp already exists in the temp directory
  if (!fs.existsSync(ytDlpPath)) {
    console.log('Installing yt-dlp...');
    
    // Download yt-dlp binary using Node.js https module
    const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    await downloadFile(ytDlpUrl, ytDlpPath);
    
    // Make it executable
    fs.chmodSync(ytDlpPath, 0o755);
    
    console.log('yt-dlp installed successfully');
  }
  
  return ytDlpPath;
}

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
  try {
    // Parse the request body
    const { url, action } = JSON.parse(event.body);
    
    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'URL is required' })
      };
    }
    
    // Ensure yt-dlp is available
    const ytDlpPath = await ensureYtDlp();
    
    // If action is 'validate', just get video info
    if (action === 'validate') {
      console.log('Validating URL:', url);
      
      try {
        // Use --simulate flag to just check the URL without downloading
        const { stdout, stderr } = await runCommand(ytDlpPath, ['--simulate', '--dump-json', url]);
        
        if (stderr) {
          console.error('Validation stderr:', stderr);
        }
        
        const videoInfo = JSON.parse(stdout);
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            title: videoInfo.title,
            duration: videoInfo.duration,
            webpage_url: videoInfo.webpage_url
          })
        };
      } catch (error) {
        console.error('URL validation error:', error);
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Invalid or unsupported URL',
            details: error.message
          })
        };
      }
    } else {
      // For now, just return a message that download is not implemented in the function
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'URL validation successful. Download functionality will be implemented in the next update.',
          url: url
        })
      };
    }
  } catch (error) {
    console.error('Error in simple-validate function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process video request',
        details: error.message
      })
    };
  }
};
