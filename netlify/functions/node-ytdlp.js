const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

// Function to make an HTTP request with support for redirects
function makeRequest(url, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const protocol = url.startsWith('https:') ? https : http;
    
    // Add a default user agent if not provided
    if (!options.headers) {
      options.headers = {};
    }
    if (!options.headers['User-Agent']) {
      options.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }
    
    protocol.get(url, options, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`Following redirect (${response.statusCode}) to: ${response.headers.location}`);
        // Follow the redirect - handle relative URLs
        const redirectUrl = new URL(response.headers.location, url).href;
        return makeRequest(redirectUrl, options, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }
      
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        resolve({ 
          statusCode: response.statusCode,
          headers: response.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

// Function to download a file from a URL
async function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };
    
    protocol.get(url, options, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = new URL(response.headers.location, url).href;
        return downloadFile(redirectUrl)
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
  // Try multiple API services
  try {
    // Try using ssstik.io API (popular TikTok downloader)
    const formData = `id=${encodeURIComponent(url)}&locale=en&tt=azW54a`;
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Origin': 'https://ssstik.io',
        'Referer': 'https://ssstik.io/en'
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request('https://ssstik.io/abc?url=dl', options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            // Parse the response to extract the download URL
            let downloadUrl;
            
            if (format === 'audio') {
              const match = data.match(/href="(.*?)" class="pure-button pure-button-primary is-center u-bl dl-button download_link without_watermark_audio"/);
              downloadUrl = match && match[1];
            } else if (format === 'no-watermark') {
              const match = data.match(/href="(.*?)" class="pure-button pure-button-primary is-center u-bl dl-button download_link without_watermark"/);
              downloadUrl = match && match[1];
            } else {
              const match = data.match(/href="(.*?)" class="pure-button pure-button-primary is-center u-bl dl-button download_link with_watermark"/);
              downloadUrl = match && match[1];
            }
            
            if (downloadUrl) {
              resolve(downloadUrl);
            } else {
              reject(new Error('Could not find download URL in response'));
            }
          } catch (error) {
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`API request failed: ${error.message}`));
      });
      
      req.write(formData);
      req.end();
    });
  } catch (error) {
    console.error('Primary API service failed:', error);
    
    // Fallback to another service
    try {
      // Try using snaptik.app as fallback
      const formData = `url=${encodeURIComponent(url)}`;
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };
      
      return new Promise((resolve, reject) => {
        const req = https.request('https://snaptik.app/abc.php', options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              // Parse the response to extract the download URL
              const match = data.match(/href="(.*?)" class="abutton is-success is-fullwidth"/);
              if (match && match[1]) {
                resolve(match[1]);
              } else {
                reject(new Error('Could not find download URL in response'));
              }
            } catch (error) {
              reject(new Error(`Failed to parse API response: ${error.message}`));
            }
          });
        });
        
        req.on('error', (error) => {
          reject(new Error(`API request failed: ${error.message}`));
        });
        
        req.write(formData);
        req.end();
      });
    } catch (fallbackError) {
      throw new Error(`All API services failed: ${error.message}, ${fallbackError.message}`);
    }
  }
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
