import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    console.log('Received URL:', url);

    if (!url) {
      console.log('No URL provided');
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Use yt-dlp to get video info without downloading
    try {
      const { stdout, stderr } = await execAsync(`yt-dlp --dump-json "${url}"`);
      
      if (stderr) {
        console.error('Validation stderr:', stderr);
      }

      const videoInfo = JSON.parse(stdout);
      
      return NextResponse.json({ 
        success: true,
        title: videoInfo.title,
        duration: videoInfo.duration,
        webpage_url: videoInfo.webpage_url
      });

    } catch (error: any) {
      console.error('URL validation error:', error);
      return NextResponse.json(
        { 
          error: 'Invalid or unsupported URL',
          details: error.message
        },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error('Error in download route:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process video request',
        details: error.message
      },
      { status: 500 }
    );
  }
}
