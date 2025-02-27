import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

// Define FFmpeg paths - use environment variables or default to common paths
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
// Get the yt-dlp path from environment variable or use the one in bin directory
const YT_DLP_PATH = process.env.YT_DLP_PATH || 'yt-dlp';

// Function to sanitize filenames
function sanitizeFilename(filename: string): string {
  // Replace emojis and other non-ASCII characters with empty string
  return filename
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim();
}

export async function POST(request: Request): Promise<NextResponse> {
  const tempDir = path.join(os.tmpdir(), 'tiktok-downloads-' + Date.now());
  
  try {
    const { url, format } = await request.json();
    console.log('Processing download request:', { url, format });

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Create a temporary directory for downloads
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('Created temp directory:', tempDir);

    // Use a simple filename template to avoid issues with special characters
    const outputTemplate = path.join(tempDir, 'video.%(ext)s');
    
    // Construct the yt-dlp command based on format
    let command = `${YT_DLP_PATH} `;
    
    // Add FFmpeg location if not using PATH
    if (FFMPEG_PATH !== 'ffmpeg') {
      command += `--ffmpeg-location "${FFMPEG_PATH}" `;
    }
    
    if (format === 'audio') {
      command += `-x --audio-format mp3 `;
    } else if (format === 'no-watermark') {
      command += `-f "bv*[vcodec!=h264]+ba/b" `;
    } else {
      command += `-f "best" `;
    }
    
    command += `-o "${outputTemplate}" "${url}"`;
    console.log('Running download command:', command);

    try {
      // Execute the yt-dlp command
      const { stdout, stderr } = await execAsync(command);
      console.log('Download stdout:', stdout);
      if (stderr) console.error('Download stderr:', stderr);

      // Find the downloaded file
      const files = fs.readdirSync(tempDir);
      if (files.length === 0) {
        throw new Error('No file was downloaded');
      }

      // Find the actual downloaded file
      const downloadedFile = files[0];
      const filePath = path.join(tempDir, downloadedFile);
      console.log('Downloaded file:', filePath);
      
      let finalFilePath = filePath;
      
      // If downloading without watermark, enhance the video quality
      if (format === 'no-watermark') {
        console.log('Enhancing video quality...');
        
        // Create enhanced video filename
        const enhancedFilePath = path.join(tempDir, 'enhanced_video.mp4');
        
        // Enhance video quality using FFmpeg
        // 1. Upscale to 1080p using Lanczos algorithm (high quality)
        // 2. Apply unsharp mask for better details
        // 3. Improve colors and contrast
        // 4. Use high quality encoding settings
        const ffmpegCmd = FFMPEG_PATH === 'ffmpeg' ? 'ffmpeg' : `"${FFMPEG_PATH}"`;
        const enhanceCommand = `${ffmpegCmd} -i "${filePath}" -vf "scale=1920:1080:flags=lanczos,unsharp=3:3:1.5:3:3:0.5,eq=contrast=1.1:brightness=0.05:saturation=1.2" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k "${enhancedFilePath}"`;
        
        console.log('Running enhancement command:', enhanceCommand);
        
        const { stderr: enhanceStderr } = await execAsync(enhanceCommand);
        if (enhanceStderr) console.log('Enhancement stderr:', enhanceStderr);
        
        // Check if enhanced file was created
        if (fs.existsSync(enhancedFilePath)) {
          console.log('Video enhancement complete');
          finalFilePath = enhancedFilePath;
        } else {
          console.warn('Enhanced file not created, using original');
        }
      }
      
      // Get video info to create a sanitized filename
      const infoCommand = `${YT_DLP_PATH} --dump-json "${url}"`;
      console.log('Running info command:', infoCommand);
      const { stdout: infoStdout } = await execAsync(infoCommand);
      const videoInfo = JSON.parse(infoStdout);
      
      // Create a safe filename
      let safeFilename = sanitizeFilename(videoInfo.title || 'tiktok-video');
      if (!safeFilename || safeFilename.length < 3) {
        safeFilename = 'tiktok-video';
      }
      
      // Add quality indicator for enhanced videos
      if (format === 'no-watermark') {
        safeFilename += `-enhanced-HD.mp4`;
      } else {
        safeFilename += `-${format}.${format === 'audio' ? 'mp3' : 'mp4'}`;
      }
      
      // Read the final file
      const fileBuffer = fs.readFileSync(finalFilePath);
      
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('Cleaned up temp directory');

      // Determine content type
      const contentType = format === 'audio' ? 'audio/mpeg' : 'video/mp4';

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Disposition': `attachment; filename="${safeFilename}"`,
          'Content-Type': contentType,
        },
      });

    } catch (error: unknown) {
      console.error('Download error:', error);
      // Clean up on error
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    }

  } catch (error: unknown) {
    console.error('Error in download-video route:', error);
    // Clean up on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to download video',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
