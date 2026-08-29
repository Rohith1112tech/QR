import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Image as ImageIcon, 
  Video, 
  UploadCloud, 
  X, 
  Download, 
  Copy, 
  Check, 
  AlertCircle, 
  QrCode, 
  RefreshCw,
  Palette,
  Sliders
} from 'lucide-react';
import QRCode from 'qrcode';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CreateQR() {
  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'image' | 'video'
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [expiry, setExpiry] = useState('never'); // Default: Never
  const [isDragging, setIsDragging] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { shortId, qrCode, viewUrl, expiresAt }
  const [copied, setCopied] = useState(false);
  
  // QR Code Customization States
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [qrMargin, setQrMargin] = useState(2);
  const [customQrUrl, setCustomQrUrl] = useState('');

  const fileInputRef = useRef(null);

  // Tab switcher helper
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError('');
    // Clear file/preview when switching tabs
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
  };

  // File validation and handling
  const handleFileSelect = (selectedFile) => {
    setError('');
    if (!selectedFile) return;

    // Size limit: 25MB
    const maxSizeBytes = 25 * 1024 * 1024;
    if (selectedFile.size > maxSizeBytes) {
      setError('File is too large. Maximum size allowed is 25MB.');
      return;
    }

    // Type validation based on tab selection
    const isImageTab = activeTab === 'image';
    const isVideoTab = activeTab === 'video';

    if (isImageTab && !selectedFile.type.startsWith('image/')) {
      setError('Invalid file type. Please upload an image.');
      return;
    }
    if (isVideoTab && !selectedFile.type.startsWith('video/')) {
      setError('Invalid file type. Please upload a video.');
      return;
    }

    setFile(selectedFile);
    
    // Revoke old object URL if exists
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const clearFile = (e) => {
    e.stopPropagation();
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Submit and call POST /api/create
  const handleGenerate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('type', activeTab);
      formData.append('expiryHours', expiry);

      if (activeTab === 'text') {
        if (!textContent.trim()) {
          throw new Error('Please enter some text content.');
        }
        formData.append('content', textContent);
      } else {
        if (!file) {
          throw new Error(`Please upload a ${activeTab} file first.`);
        }
        formData.append('file', file);
      }

      const response = await fetch(`${API_BASE_URL}/api/create`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate QR code.');
      }

      setResult({
        shortId: data.shortId,
        qrCode: data.qrCode,
        viewUrl: data.viewUrl,
        expiresAt: data.expiresAt
      });

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Dynamic QR Code Customizer hook
  useEffect(() => {
    if (result && result.viewUrl) {
      QRCode.toDataURL(result.viewUrl, {
        color: {
          dark: fgColor,
          light: bgColor
        },
        margin: qrMargin,
        width: 400,
        errorCorrectionLevel: 'H'
      })
      .then(url => {
        setCustomQrUrl(url);
      })
      .catch(err => {
        console.error('Failed to regenerate customized QR Code:', err);
      });
    }
  }, [result, fgColor, bgColor, qrMargin]);

  // Action helpers
  const handleDownload = () => {
    const downloadUrl = customQrUrl || result?.qrCode;
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `qr-code-${result.shortId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.viewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      setError('Could not copy link to clipboard.');
    }
  };

  const handleReset = () => {
    setResult(null);
    setTextContent('');
    setFile(null);
    setFgColor('#000000');
    setBgColor('#ffffff');
    setQrMargin(2);
    setCustomQrUrl('');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    setError('');
  };

  return (
    <div className="glass-container">
      <div className="guest-nav-header" style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginBottom: '1rem' }}>
        <Link to="/dashboard" className="btn-secondary" style={{ textDecoration: 'none', padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
          Go to Dashboard / Login
        </Link>
      </div>
      <div className="header">
        <h1>QR Content Generator</h1>
        <p>Generate dynamic QR codes that link to text, photos, or videos.</p>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {!result ? (
        <form onSubmit={handleGenerate}>
          {/* Content Type Tabs */}
          <div className="tabs">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => handleTabChange('text')}
            >
              <FileText size={18} />
              Text
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'image' ? 'active' : ''}`}
              onClick={() => handleTabChange('image')}
            >
              <ImageIcon size={18} />
              Photo
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => handleTabChange('video')}
            >
              <Video size={18} />
              Video
            </button>
          </div>

          {/* Dynamic Content Forms */}
          {activeTab === 'text' ? (
            <div className="form-group">
              <label className="form-label">Text Content</label>
              <textarea
                className="textarea-field"
                placeholder="Type your message, link, or text content here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                maxLength={1000}
                required
              />
              <div className="char-counter">
                {textContent.length} / 1000 characters
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">Upload {activeTab === 'image' ? 'Photo' : 'Video'}</label>
              
              {!file ? (
                <div 
                  className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={triggerFileSelect}
                >
                  <input 
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept={activeTab === 'image' ? 'image/*' : 'video/*'}
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                  />
                  <UploadCloud size={44} className="upload-icon" />
                  <div className="upload-text">
                    Drag and drop your {activeTab} here, or <span>browse</span>
                  </div>
                  <div className="upload-hint">
                    Supports JPG, PNG, WEBP, MP4, MOV, WEBM (Max 25MB)
                  </div>
                </div>
              ) : (
                <div className="preview-container">
                  {activeTab === 'image' ? (
                    <img 
                      src={previewUrl} 
                      alt="Upload Preview" 
                      className="preview-media"
                    />
                  ) : (
                    <video 
                      src={previewUrl} 
                      className="preview-media"
                      controls
                      muted
                    />
                  )}
                  <button 
                    type="button" 
                    className="preview-clear" 
                    onClick={clearFile}
                    title="Remove file"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner" />
                Generating QR Code...
              </>
            ) : (
              <>
                <QrCode size={20} />
                Generate QR Code
              </>
            )}
          </button>
        </form>
      ) : (
        /* Result QR Display Screen */
        <div className="qr-result-box">
          <h2 className="qr-title">Your QR Code is Ready!</h2>
          <p className="qr-subtitle">Scan to view content.</p>
          
          <div className="qr-image-wrapper">
            <img 
              src={customQrUrl || result.qrCode} 
              alt="Generated QR Code" 
              className="qr-image" 
            />
          </div>

          {/* NEW: QR Customization Panel */}
          <div className="customization-panel">
            <div className="custom-title-row">
              <Palette size={16} style={{ color: '#60a5fa' }} />
              <h4>QR Code Design & Colors</h4>
            </div>
            
            <div className="custom-row">
              <div className="custom-col">
                <label className="custom-label">QR Color</label>
                <div className="color-input-wrapper">
                  <input 
                    type="color" 
                    value={fgColor} 
                    onChange={(e) => setFgColor(e.target.value)}
                    className="color-picker-input"
                  />
                  <span className="color-hex-text">{fgColor.toUpperCase()}</span>
                </div>
              </div>
              
              <div className="custom-col">
                <label className="custom-label">Background</label>
                <div className="color-input-wrapper">
                  <input 
                    type="color" 
                    value={bgColor} 
                    onChange={(e) => setBgColor(e.target.value)}
                    className="color-picker-input"
                  />
                  <span className="color-hex-text">{bgColor.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <div className="custom-row slider-container">
              <div className="custom-col flex-1">
                <div className="slider-label-row">
                  <div className="label-with-icon">
                    <Sliders size={14} style={{ color: '#9ca3af' }} />
                    <label className="custom-label">Margin Spacing</label>
                  </div>
                  <span className="slider-val-text">{qrMargin}px</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="12" 
                  value={qrMargin} 
                  onChange={(e) => setQrMargin(parseInt(e.target.value, 10))}
                  className="range-slider"
                />
              </div>
            </div>
          </div>

          <div className="qr-actions">
            <button className="btn-primary" onClick={handleDownload}>
              <Download size={18} />
              Download QR Code
            </button>
            <button className="btn-secondary" onClick={handleCopyLink}>
              {copied ? <Check size={18} style={{ color: '#10b981' }} /> : <Copy size={18} />}
              {copied ? 'Copied Link!' : 'Copy View Link'}
            </button>
            
            <a 
              href={`/view/${result.shortId}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn-link"
            >
              Open View Page directly
            </a>

            <button 
              className="btn-secondary" 
              onClick={handleReset} 
              style={{ marginTop: '1rem', background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)' }}
            >
              <RefreshCw size={16} />
              Generate Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
