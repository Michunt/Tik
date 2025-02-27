'use client';

import { useState, useEffect } from 'react';

interface VideoInfo {
  success: boolean;
  title: string;
  duration: number;
  webpage_url: string;
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
      // Validate URL first
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      const data: VideoInfo = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to process video');
      }
      
      setVideoInfo(data);
    } catch (error: unknown) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
