const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const crypto = require('crypto');

// Function to download a file from a URL
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? require('https') : require('http');
    
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      // Get content type for determining file extension
      const contentType = response.headers['content-type'] || '';
      let extension = '.mp4';
      if (contentType.includes('audio')) {
        extension = '.mp3';
      }
      
      // Create a buffer to store the file data
      const chunks = [];
      
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ buffer, extension });
      });
    }).on('error', reject);
  });
}

// Function to extract TikTok video ID from URL
function extractTikTokId(url) {
  const matches = url.match(/video\/(\d+)/);
  return matches ? matches[1] : null;
}

// Function to get TikTok video download URL using a third-party service
async function getTikTokDownloadUrl(url, format = 'video') {
  // Extract the video ID from the URL
  const videoId = extractTikTokId(url);
  if (!videoId) {
    throw new Error('Could not extract video ID from TikTok URL');
  }
  
  // For this implementation, we'll use a simple approach to get the video
  // In a real implementation, you might want to use a more reliable third-party service
  
  // Construct a direct download URL based on the format
  // This is a simplified approach and may not work for all TikTok videos
  let downloadUrl;
  
  if (format === 'no-watermark') {
    // For no-watermark, we'll use a different approach
    downloadUrl = `https://api.tikwm.com/video/data?url=${encodeURIComponent(url)}`;
  } else if (format === 'audio') {
    // For audio only
    downloadUrl = `https://api.tikwm.com/video/data?url=${encodeURIComponent(url)}&hd=0&audio=1`;
  } else {
    // For regular video
    downloadUrl = `https://api.tikwm.com/video/data?url=${encodeURIComponent(url)}&hd=1`;
  }
  
  // Get the response from the API
  return new Promise((resolve, reject) => {
    https.get(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`API request failed: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          if (jsonData.code !== 0) {
            reject(new Error(`API error: ${jsonData.msg || 'Unknown error'}`));
            return;
          }
          
          if (format === 'audio') {
            resolve(jsonData.data.music);
          } else if (format === 'no-watermark') {
            resolve(jsonData.data.play);
          } else {
            resolve(jsonData.data.play); // Regular video
          }
        } catch (error) {
          reject(new Error(`Failed to parse API response: ${error.message}`));
        }
      });
    }).on('error', reject);
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

// Function to validate a TikTok URL using Node.js
async function validateTikTokUrl(url) {
  // Simple URL validation
  if (!url.match(/https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com)\/.+/i)) {
    throw new Error('Not a valid TikTok URL');
  }
  
  // For now, just return basic info since we can't run yt-dlp
  return {
    success: true,
    title: 'TikTok Video',
    duration: 30, // Placeholder
    webpage_url: url
  };
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
    const { url, action, format } = JSON.parse(event.body);
    
    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'URL is required' })
      };
    }
    
    // If action is 'validate', just get video info
    if (action === 'validate') {
      console.log('Validating URL:', url);
      
      try {
        // Validate the URL using our Node.js function
        const videoInfo = await validateTikTokUrl(url);
        
        return {
          statusCode: 200,
          body: JSON.stringify(videoInfo)
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
    } else if (action === 'download') {
      console.log(`Downloading ${format} for URL:`, url);
      
      try {
        // Get the download URL for the requested format
        const downloadUrl = await getTikTokDownloadUrl(url, format);
        
        // Download the file
        const { buffer, extension } = await downloadFile(downloadUrl);
        
        // Generate a filename
        const filename = `tiktok-${format}${extension}`;
        
        // Return the file as a base64-encoded string
        return {
          statusCode: 200,
          headers: {
            'Content-Type': format === 'audio' ? 'audio/mpeg' : 'video/mp4',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': buffer.length.toString()
          },
          body: buffer.toString('base64'),
          isBase64Encoded: true
        };
      } catch (error) {
        console.error('Download error:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'Failed to download video',
            details: error.message
          })
        };
      }
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Invalid action',
          details: 'Action must be either "validate" or "download"'
        })
      };
    }
  } catch (error) {
    console.error('Error in node-ytdlp function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process video request',
        details: error.message
      })
    };
  }
};
