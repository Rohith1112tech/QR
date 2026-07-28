import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Clock, 
  ArrowLeft, 
  Copy, 
  Check, 
  VolumeX, 
  Volume2, 
  Maximize2, 
  ExternalLink,
  PlusCircle
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function ViewQR() {
  const { shortId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [error, setError] = useState('');
  
  // Custom interactive states
  const [copied, setCopied] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  
  const videoRef = useRef(null);

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      setError('');
      setIsExpired(false);
      try {
        const response = await fetch(`${API_BASE_URL}/api/content/${shortId}`);
        
        if (response.status === 404) {
          setIsExpired(true);
          return;
        }

        const resData = await response.json();
        
        if (!response.ok) {
          throw new Error(resData.error || 'Failed to fetch content.');
        }

        setData(resData);
      } catch (err) {
        console.error(err);
        setError(err.message || 'An error occurred while loading content.');
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [shortId]);

  // Copy helper for text content
  const handleCopyText = async () => {
    if (!data || !data.content) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  // Unmute helper for video
  const handleUnmute = () => {
    setIsMuted(false);
    if (videoRef.current) {
      videoRef.current.muted = false;
    }
  };

  // URL resolution for uploads (supports relative /uploads paths in local fallback)
  const getFullMediaUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${API_BASE_URL}${url}`;
  };

  // Font size scaler based on text length
  const getFontSizeStyle = (text) => {
    if (!text) return {};
    const length = text.length;
    let size = '1.3rem';
    let weight = '400';

    if (length < 40) {
      size = '2.8rem';
      weight = '600';
    } else if (length < 120) {
      size = '2rem';
      weight = '500';
    } else if (length < 350) {
      size = '1.6rem';
      weight = '400';
    }

    return {
      fontSize: size,
      fontWeight: weight,
    };
  };

  // RENDER 1: Loading state
  if (loading) {
    return (
      <div className="page-loading-container">
        <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
        <p className="page-loading-text">Fetching secure QR content...</p>
      </div>
    );
  }

  // RENDER 2: Expired / Not Found state
  if (isExpired) {
    return (
      <div className="expired-container">
        <div className="expired-icon-box">
          <Clock size={36} />
        </div>
        <h2 className="expired-title">Content Has Expired</h2>
        <p className="expired-desc">
          To maintain user privacy and storage integrity, this QR code's content was automatically deleted and is no longer available.
        </p>
        <Link to="/" className="btn-primary" style={{ textDecoration: 'none' }}>
          <PlusCircle size={18} />
          Create Your Own QR Code
        </Link>
      </div>
    );
  }

  // RENDER 3: Generic error
  if (error) {
    return (
      <div className="glass-container" style={{ textAlign: 'center' }}>
        <div className="error-banner" style={{ marginBottom: '2rem' }}>
          <Clock size={20} />
          <span>{error}</span>
        </div>
        <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
          <ArrowLeft size={18} />
          Back to Dashboard
        </Link>
      </div>
    );
  }

  // RENDER 4: Dynamic content render by type
  if (data) {
    const finalUrl = getFullMediaUrl(data.mediaUrl);

    return (
      <>
        {/* TEXT CONTENT VIEWER */}
        {data.type === 'text' && (
          <div className="text-viewer-container">
            <div className="text-viewer-badge">
              <span className="lock-dot"></span>
              SECURE SHARED MESSAGE
            </div>
            <h1 className="text-content" style={getFontSizeStyle(data.content)}>
              {data.content}
            </h1>
            
            <div className="floating-actions">
              <button className="floating-btn" onClick={handleCopyText}>
                {copied ? <Check size={16} style={{ color: '#10b981' }} /> : <Copy size={16} />}
                {copied ? 'Copied text!' : 'Copy content'}
              </button>
              <Link to="/" className="floating-btn" style={{ textDecoration: 'none' }}>
                <PlusCircle size={16} />
                Create QR
              </Link>
            </div>
          </div>
        )}

        {/* IMAGE CONTENT VIEWER */}
        {data.type === 'image' && (
          <div className="image-viewer-container">
            <div 
              className={`image-wrapper ${isZoomed ? 'zoomed' : ''}`}
              onClick={() => setIsZoomed(!isZoomed)}
            >
              <img 
                src={finalUrl} 
                alt="Shared QR Content" 
                className="view-image"
              />
            </div>
            
            <span className="image-hint">
              Tap image to {isZoomed ? 'shrink' : 'zoom'}
            </span>

            <div className="floating-actions" style={{ marginTop: '2.5rem' }}>
              <a 
                href={finalUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="floating-btn"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink size={16} />
                Open original
              </a>
              <Link to="/" className="floating-btn" style={{ textDecoration: 'none' }}>
                <PlusCircle size={16} />
                Create QR
              </Link>
            </div>
          </div>
        )}

        {/* VIDEO CONTENT VIEWER */}
        {data.type === 'video' && (
          <div className="video-viewer-container">
            <div className="video-player-wrapper">
              {isMuted && (
                <div className="video-unmute-overlay" onClick={handleUnmute}>
                  <VolumeX size={16} />
                  <span>Tap to Unmute</span>
                </div>
              )}
              <video 
                ref={videoRef}
                src={finalUrl}
                className="view-video"
                controls
                autoPlay
                loop
                playsInline
                muted={isMuted}
              />
            </div>

            <div className="floating-actions" style={{ marginTop: '2.5rem' }}>
              {isMuted ? (
                <button className="floating-btn" onClick={handleUnmute}>
                  <Volume2 size={16} />
                  Unmute Player
                </button>
              ) : null}
              <Link to="/" className="floating-btn" style={{ textDecoration: 'none' }}>
                <PlusCircle size={16} />
                Create QR
              </Link>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
