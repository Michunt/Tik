'use client';

import { useState, useEffect } from 'react';

interface VideoInfo {
  success: boolean;
  title?: string;
  duration?: number;
  webpage_url?: string;
  error?: string;
  details?: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadType, setDownloadType] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleValidate = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setVideoInfo(null);
    
    try {
      // Validate URL using our Netlify function
      const response = await fetch('/.netlify/functions/node-ytdlp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, action: 'validate' }),
      });
      
      const data: VideoInfo = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to process video');
      }
      
      setVideoInfo(data);
    } catch (error: unknown) {
      console.error('Error:', error);
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Make error messages more user-friendly
      if (errorMessage.includes('command not found')) {
        errorMessage = 'Server configuration error: Required tools are not available. Please try again later.';
      } else if (errorMessage.includes('No such file or directory')) {
        errorMessage = 'Server configuration error: Required files are missing. Please try again later.';
      } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
        errorMessage = 'Network error: Please check your internet connection and try again.';
      } else if (errorMessage.includes('tiktok')) {
        errorMessage = 'Error processing TikTok video: Please ensure you have a valid TikTok video URL.';
      } else if (errorMessage.includes('302') || errorMessage.includes('301') || errorMessage.includes('redirect')) {
        errorMessage = 'Server error: Redirect issue. Our team has been notified and is working on a fix.';
      } else if (errorMessage.includes('download')) {
        errorMessage = 'Download error: Could not download required components. Please try again later.';
      } else if (errorMessage.includes('Failed to process video')) {
        errorMessage = 'Processing error: Could not process the TikTok video. Please try a different video.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: string) => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setDownloadType(format);
    
    try {
      // Download the video
      const response = await fetch('/api/download-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, format }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to download video');
      }

      // Get the filename from the Content-Disposition header if available
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `tiktok-${format}.${format === 'audio' ? 'mp3' : 'mp4'}`;
      
      if (contentDisposition) {
        const matches = /filename="([^"]+)"/.exec(contentDisposition);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error: unknown) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
      setDownloadType(null);
    }
  };

  // Don't render anything until mounted to prevent hydration errors
  if (!mounted) {
    return null;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">TikTok Downloader</h1>
          <p className="text-gray-600 text-sm">Download TikTok videos with ease!</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Paste TikTok video URL here"
              className="w-full p-3 border rounded-lg pr-10 focus:outline-none focus:border-pink-500"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.readText().then(text => setUrl(text));
                }
              }}
            >
              📋
            </button>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center p-2 bg-red-50 rounded-lg">
              {error}
            </div>
          )}

          {!videoInfo ? (
            <button
              onClick={handleValidate}
              disabled={loading || !url}
              className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300"
            >
              {loading ? 'Processing...' : 'Check URL'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-50 p-3 rounded-lg">
                <h3 className="font-medium text-center mb-2">{videoInfo.title}</h3>
                {videoInfo.duration && (
                  <p className="text-sm text-center text-gray-500">Duration: {videoInfo.duration} seconds</p>
                )}
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => handleDownload('video')}
                  disabled={loading}
                  className="w-full bg-black text-white py-2 rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-300"
                >
                  {loading && downloadType === 'video' ? 'Downloading...' : 'Download Video'}
                </button>
                <button 
                  onClick={() => handleDownload('audio')}
                  disabled={loading}
                  className="w-full bg-blue-500 text-white py-2 rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300"
                >
                  {loading && downloadType === 'audio' ? 'Downloading...' : 'Download Audio Only'}
                </button>
                <button 
                  onClick={() => handleDownload('no-watermark')}
                  disabled={loading}
                  className="w-full bg-red-500 text-white py-2 rounded-lg font-medium hover:bg-red-600 disabled:bg-gray-300"
                >
                  {loading && downloadType === 'no-watermark' ? 'Processing HD Video...' : 'Download Enhanced HD (No Watermark)'}
                </button>
                <button 
                  onClick={() => {
                    setUrl('');
                    setVideoInfo(null);
                    setError(null);
                  }}
                  className="w-full text-gray-500 text-sm hover:text-gray-700"
                >
                  Try another video
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
