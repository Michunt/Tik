const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

// Function to download and install yt-dlp if needed
async function ensureYtDlp() {
  const tempDir = os.tmpdir();
  const ytDlpPath = path.join(tempDir, 'yt-dlp');
  
  // Check if yt-dlp already exists in the temp directory
  if (!fs.existsSync(ytDlpPath)) {
    console.log('Installing yt-dlp...');
    
    // Download yt-dlp binary
    await execAsync(`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${ytDlpPath}`);
    
    // Make it executable
    await execAsync(`chmod +x ${ytDlpPath}`);
    
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
        const { stdout, stderr } = await execAsync(`${ytDlpPath} --dump-json "${url}"`);
        
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
