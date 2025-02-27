const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

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
    
    try {
      // Try downloading the binary version first
      // Use a direct download URL instead of the redirect URL
      const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/download/2023.11.16/yt-dlp';
      await downloadFile(ytDlpUrl, ytDlpPath);
      
      // Make it executable
      fs.chmodSync(ytDlpPath, 0o755);
      
      console.log('yt-dlp binary installed successfully');
    } catch (error) {
      console.error('Failed to download yt-dlp binary:', error);
      
      // Fallback: Try downloading the Python version
      console.log('Trying to download Python version as fallback...');
      try {
        const pythonYtDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/download/2023.11.16/yt-dlp.tar.gz';
        const tarballPath = path.join(tempDir, 'yt-dlp.tar.gz');
        
        // Download the tarball
        await downloadFile(pythonYtDlpUrl, tarballPath);
        
        // Create a simple wrapper script that uses node to execute the Python script
        const wrapperScript = `#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

// Pass all arguments to the Python script
const args = process.argv.slice(2);
const result = spawnSync('python', [path.join(__dirname, 'yt-dlp.py'), ...args], { 
  stdio: 'inherit',
  encoding: 'utf-8'
});

process.exit(result.status);`;
        
        // Write the wrapper script to the yt-dlp path
        fs.writeFileSync(ytDlpPath, wrapperScript);
        fs.chmodSync(ytDlpPath, 0o755);
        
        console.log('yt-dlp Python wrapper installed successfully');
      } catch (fallbackError) {
        console.error('Failed to install yt-dlp Python version:', fallbackError);
        throw new Error('Could not install yt-dlp: ' + error.message);
      }
    }
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
