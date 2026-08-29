import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink, ShieldAlert, Award } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function RedirectHandler() {
  const { shortId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [showAd, setShowAd] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [destinationUrl, setDestinationUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const recordScanAndRedirect = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/scan/${shortId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('QR Code expired or does not exist.');
        }

        const data = await response.json();

        // 1. If it's a content QR code (text, image, video), redirect to the view page directly
        if (data.type !== 'url') {
          navigate(`/view/${shortId}`, { replace: true });
          return;
        }

        // 2. If it is a URL QR code
        if (data.isPremium) {
          // Premium tier: redirect immediately!
          window.location.replace(data.content);
        } else {
          // Free tier: show advertisement page
          setDestinationUrl(data.content);
          setShowAd(true);
          setLoading(false);
        }

      } catch (err) {
        console.error(err);
        setError(err.message || 'An error occurred while scanning.');
        setLoading(false);
        // Redirect to view page after 3 seconds so the expired state handles it nicely
        setTimeout(() => {
          navigate(`/view/${shortId}`, { replace: true });
        }, 3000);
      }
    };

    recordScanAndRedirect();
  }, [shortId, navigate]);

  // Countdown timer hook for free tier ad page
  useEffect(() => {
    let timer;
    if (showAd && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    } else if (showAd && countdown === 0) {
      // Auto-redirect once countdown hits zero
      window.location.replace(destinationUrl);
    }
    return () => clearTimeout(timer);
  }, [showAd, countdown, destinationUrl]);

  const handleSkipAd = () => {
    if (countdown === 0) {
      window.location.replace(destinationUrl);
    }
  };

  if (loading) {
    return (
      <div className="redirect-loading-container">
        <Loader2 className="spinner-icon" size={48} />
        <h2>Processing QR Code...</h2>
        <p>Connecting you to your secure tracking link.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="redirect-error-container glass-container">
        <ShieldAlert size={48} className="error-icon" />
        <h2>Scan Error</h2>
        <p>{error}</p>
        <p className="redirecting-text">Redirecting you to details page...</p>
      </div>
    );
  }

  if (showAd) {
    return (
      <div className="ad-page-container">
        <div className="ad-header">
          <div className="ad-badge">
            <Award size={14} />
            Free QR Link sponsored by ME-QR
          </div>
          <div className="ad-timer">
            {countdown > 0 ? (
              <span>Redirecting in <strong>{countdown}s</strong>...</span>
            ) : (
              <span className="ready-text">Ready!</span>
            )}
          </div>
        </div>

        <div className="ad-content-wrapper glass-container">
          <div className="mock-ad-banner">
            <h3>🚀 UNLOCK UNLIMITED POSSIBILITIES</h3>
            <p>Tired of waiting for redirects? Get premium ad-free links, advanced tracking analytics, multi-user workspaces, and customizable folders.</p>
            <div className="mock-ad-image-placeholder">
              <span className="ad-promo-tag">SPONSORED PROMO</span>
              <h4>UPGRADE TO PREMIUM NOW</h4>
              <p>Scan. Track. Manage. Collaborate.</p>
            </div>
            <button className="btn-primary ad-cta-btn" onClick={() => window.open('/auth', '_blank')}>
              Try ME-QR Premium
            </button>
          </div>
        </div>

        <div className="ad-footer">
          <button 
            className={`btn-secondary skip-ad-btn ${countdown > 0 ? 'disabled' : ''}`}
            onClick={handleSkipAd}
            disabled={countdown > 0}
          >
            {countdown > 0 ? `Skip Ad in ${countdown}s` : 'Skip Ad & Continue'}
            <ExternalLink size={14} style={{ marginLeft: '0.5rem' }} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
