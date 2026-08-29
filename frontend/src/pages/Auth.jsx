import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, Lock, Mail, User, ArrowLeft } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const bodyData = isLogin ? { email, password } : { name, email, password };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please try again.');
      }

      // Save token and user details to localStorage
      localStorage.setItem('qr_token', data.token);
      localStorage.setItem('qr_user', JSON.stringify(data.user));

      // Redirect to dashboard
      navigate('/dashboard');

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <Link to="/" className="back-link">
        <ArrowLeft size={18} />
        Back to Generator
      </Link>
      
      <div className="auth-card glass-container">
        <div className="auth-header">
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p>{isLogin ? 'Login to manage your dynamic QR Codes & analytics' : 'Sign up to organize QR codes in folders & collaborate'}</p>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: '1.5rem' }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div className="input-with-icon">
                <User size={18} className="input-icon" />
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={!isLogin}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-with-icon">
              <Mail size={18} className="input-icon" />
              <input 
                type="email" 
                className="input-field" 
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input 
                type="password" 
                className="input-field" 
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary auth-submit-btn" disabled={loading}>
            {loading ? (
              <>
                <div className="spinner" />
                {isLogin ? 'Logging in...' : 'Signing up...'}
              </>
            ) : (
              isLogin ? 'Login' : 'Create Account'
            )}
          </button>
        </form>

        <div className="auth-toggle">
          <span>{isLogin ? "Don't have an account?" : 'Already have an account?'}</span>
          <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
            {isLogin ? 'Sign up' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );
}
