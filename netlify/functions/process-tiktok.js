const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const execAsync = promisify(exec);

// Function to download a file using Node.js https module with redirect support
function downloadFile(url, destination, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    // Maximum number of redirects to follow
    const MAX_REDIRECTS = 5;
    
    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error(`Too many redirects (${redirectCount}) when downloading ${url}`));
      return;
    }
    
    // Determine if we're using http or https
    const protocol = url.startsWith('https:') ? require('https') : require('http');
    
    protocol.get(url, (response) => {
      // Handle redirects (status codes 301, 302, 303, 307, 308)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`Following redirect (${response.statusCode}) to: ${response.headers.location}`);
        // Follow the redirect
        return downloadFile(response.headers.location, destination, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      const file = fs.createWriteStream(destination);
      
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

// Function to download and install yt-dlp if needed
async function ensureYtDlp() {
  const tempDir = os.tmpdir();
  const ytDlpPath = path.join(tempDir, 'yt-dlp');
  
  // Check if yt-dlp already exists in the temp directory
  if (!fs.existsSync(ytDlpPath)) {
    console.log('Installing yt-dlp...');
    
    // Download yt-dlp binary using Node.js https module
    // Use a direct download URL instead of the redirect URL
    const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/download/2023.11.16/yt-dlp';
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
        const { stdout, stderr } = await execAsync(`${ytDlpPath} --simulate --dump-json "${url}"`);
        
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
      // We'll implement the full download functionality in a separate update
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'URL validation successful. Download functionality will be implemented in the next update.',
          url: url
        })
      };
    }
  } catch (error) {
    console.error('Error in process-tiktok function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process video request',
        details: error.message
      })
    };
  }
};
