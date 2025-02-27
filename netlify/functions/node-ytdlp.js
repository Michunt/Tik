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
  // Try multiple API services in sequence
  const services = [
    // Service 1: Direct TikTok API approach
    async () => {
      console.log('Trying direct TikTok API approach...');
      const videoId = extractTikTokId(url);
      if (!videoId) {
        throw new Error('Could not extract video ID from TikTok URL');
      }
      
      // Make a direct request to TikTok's API
      const tiktokApiUrl = `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`;
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };
      
      const response = await makeRequest(tiktokApiUrl, options);
      
      if (response.statusCode !== 200) {
        throw new Error(`TikTok API request failed: ${response.statusCode}`);
      }
      
      try {
        const data = JSON.parse(response.body);
        if (data.aweme_list && data.aweme_list.length > 0) {
          const videoData = data.aweme_list[0];
          
          if (format === 'audio') {
            return videoData.music.play_url.url_list[0];
          } else if (format === 'no-watermark') {
            return videoData.video.play_addr.url_list[0];
          } else {
            return videoData.video.download_addr.url_list[0];
          }
        } else {
          throw new Error('No video data found in TikTok API response');
        }
      } catch (error) {
        throw new Error(`Failed to parse TikTok API response: ${error.message}`);
      }
    },
    
    // Service 2: TikMate API
    async () => {
      console.log('Trying TikMate API...');
      const tikMateUrl = 'https://api.tikmate.app/api/lookup';
      const formData = `url=${encodeURIComponent(url)}`;
      
      // Make a POST request to the TikMate API
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Origin': 'https://tikmate.app',
          'Referer': 'https://tikmate.app/'
        }
      };
      
      return new Promise((resolve, reject) => {
        const req = https.request(tikMateUrl, options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const jsonData = JSON.parse(data);
              
              if (!jsonData.success) {
                throw new Error('TikMate API returned an error');
              }
              
              let downloadUrl;
              if (format === 'audio') {
                downloadUrl = `https://tikmate.app/download/${jsonData.token}/${jsonData.id}/mp3/1/`;
              } else if (format === 'no-watermark') {
                downloadUrl = `https://tikmate.app/download/${jsonData.token}/${jsonData.id}/mp4/1/`;
              } else {
                downloadUrl = `https://tikmate.app/download/${jsonData.token}/${jsonData.id}/mp4/0/`;
              }
              
              resolve(downloadUrl);
            } catch (error) {
              reject(new Error(`Failed to parse TikMate API response: ${error.message}`));
            }
          });
        });
        
        req.on('error', (error) => {
          reject(new Error(`TikMate API request failed: ${error.message}`));
        });
        
        req.write(formData);
        req.end();
      });
    },
    
    // Service 3: SSSTik API with improved parsing
    async () => {
      console.log('Trying SSSTik API with improved parsing...');
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
              // More comprehensive parsing approach
              let downloadUrl;
              
              // Try multiple patterns to find the download URL
              const patterns = [
                // Pattern for audio
                format === 'audio' ? /href="(.*?)" class=".*?download_link without_watermark_audio.*?"/ : null,
                // Pattern for no-watermark video
                format === 'no-watermark' ? /href="(.*?)" class=".*?download_link without_watermark.*?"/ : null,
                // Pattern for regular video
                format === 'video' ? /href="(.*?)" class=".*?download_link with_watermark.*?"/ : null,
                // Generic patterns as fallbacks
                /href="(https:\/\/cdn[^"]+)".*?download/,
                /href="(https:\/\/[^"]+)".*?download/,
                /href="([^"]+)".*?download/
              ].filter(Boolean);
              
              // Try each pattern until we find a match
              for (const pattern of patterns) {
                const match = data.match(pattern);
                if (match && match[1]) {
                  downloadUrl = match[1];
                  break;
                }
              }
              
              if (downloadUrl) {
                // Log the found URL for debugging
                console.log('Found download URL:', downloadUrl);
                resolve(downloadUrl);
              } else {
                // If no URL is found, save the HTML response for debugging
                console.error('HTML parsing failed. Response content:', data.substring(0, 500) + '...');
                reject(new Error('Could not find download URL in response'));
              }
            } catch (error) {
              reject(new Error(`Failed to parse SSSTik API response: ${error.message}`));
            }
          });
        });
        
        req.on('error', (error) => {
          reject(new Error(`SSSTik API request failed: ${error.message}`));
        });
        
        req.write(formData);
        req.end();
      });
    },
    
    // Service 4: SnapTik API with improved parsing
    async () => {
      console.log('Trying SnapTik API with improved parsing...');
      const formData = `url=${encodeURIComponent(url)}`;
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Origin': 'https://snaptik.app',
          'Referer': 'https://snaptik.app/'
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
              // More comprehensive parsing approach
              let downloadUrl;
              
              // Try multiple patterns to find the download URL
              const patterns = [
                /href="(.*?)" class="abutton is-success is-fullwidth"/,
                /href="(https:\/\/cdn[^"]+)"/,
                /href="(https:\/\/[^"]+)".*?download/,
                /href="([^"]+)".*?download/
              ];
              
              // Try each pattern until we find a match
              for (const pattern of patterns) {
                const match = data.match(pattern);
                if (match && match[1]) {
                  downloadUrl = match[1];
                  break;
                }
              }
              
              if (downloadUrl) {
                // Log the found URL for debugging
                console.log('Found download URL:', downloadUrl);
                resolve(downloadUrl);
              } else {
                // If no URL is found, save the HTML response for debugging
                console.error('HTML parsing failed. Response content:', data.substring(0, 500) + '...');
                reject(new Error('Could not find download URL in response'));
              }
            } catch (error) {
              reject(new Error(`Failed to parse SnapTik API response: ${error.message}`));
            }
          });
        });
        
        req.on('error', (error) => {
          reject(new Error(`SnapTik API request failed: ${error.message}`));
        });
        
        req.write(formData);
        req.end();
      });
    },
    
    // Service 5: Direct approach using TikTok's CDN
    async () => {
      console.log('Trying direct TikTok CDN approach...');
      const videoId = extractTikTokId(url);
      if (!videoId) {
        throw new Error('Could not extract video ID from TikTok URL');
      }
      
      // This is a simplified approach that may not always work
      // but can serve as a last resort
      if (format === 'audio') {
        return `https://sf16-ies-music.tiktokcdn.com/obj/ies-music-aiso/${videoId}.mp3`;
      } else {
        return `https://api2-16-h2.musical.ly/aweme/v1/play/?video_id=${videoId}&ratio=default&line=0`;
      }
    }
  ];
  
  // Try each service in sequence until one succeeds
  let lastError;
  for (const service of services) {
    try {
      console.log('Attempting to get download URL...');
      const downloadUrl = await service();
      console.log('Successfully got download URL:', downloadUrl);
      return downloadUrl;
    } catch (error) {
      console.error('Service failed:', error.message);
      lastError = error;
      // Continue to the next service
    }
  }
  
  // If all services failed, throw the last error
  throw lastError || new Error('All download services failed');
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
    
    console.log(`Processing request: action=${action}, format=${format}, url=${url}`);
    
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
        console.log('Getting download URL...');
        const downloadUrl = await getTikTokDownloadUrl(url, format);
        console.log('Download URL obtained:', downloadUrl);
        
        // Download the file
        console.log('Downloading file from URL...');
        const { buffer, extension } = await downloadFile(downloadUrl);
        console.log('File downloaded successfully, size:', buffer.length);
        
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
        
        // Try to provide a more helpful error message
        let errorMessage = error.message;
        let statusCode = 500;
        
        if (errorMessage.includes('find download URL')) {
          errorMessage = 'Could not find a valid download URL for this TikTok video. The video might be private or removed.';
        } else if (errorMessage.includes('API request failed')) {
          errorMessage = 'TikTok download service is currently unavailable. Please try again later.';
        } else if (errorMessage.includes('extract video ID')) {
          errorMessage = 'Invalid TikTok URL format. Please provide a valid TikTok video URL.';
          statusCode = 400;
        }
        
        return {
          statusCode: statusCode,
          body: JSON.stringify({
            error: 'Failed to download video',
            details: errorMessage
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
