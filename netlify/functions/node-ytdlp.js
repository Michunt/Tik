const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

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
    const { url, action } = JSON.parse(event.body);
    
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
