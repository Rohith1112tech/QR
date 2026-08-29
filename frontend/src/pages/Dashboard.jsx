import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  FolderPlus, 
  Plus, 
  Trash2, 
  Edit2, 
  BarChart2, 
  Download, 
  Copy, 
  Check, 
  Folder, 
  UserPlus, 
  LogOut, 
  Sliders, 
  Palette, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Monitor,
  Globe,
  Settings,
  X,
  FileText,
  Image as ImageIcon,
  Video,
  Link2
} from 'lucide-react';
import QRCode from 'qrcode';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Dashboard() {
  const navigate = useNavigate();
  
  // Auth state
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  
  // App state
  const [qrs, setQrs] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null); // null = "All"
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState('qrs'); // 'qrs' | 'analytics' | 'team'
  
  // Workspace analytics state
  const [workspaceStats, setWorkspaceStats] = useState({
    totalQRs: 0,
    totalScans: 0,
    devices: [],
    browsers: [],
    operatingSystems: [],
    countries: [],
    scansTimeline: []
  });

  // Folder creation
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderModal, setShowFolderModal] = useState(false);

  // Workspace team state
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Single QR code details/analytics modal
  const [selectedQR, setSelectedQR] = useState(null);
  const [selectedQRStats, setSelectedQRStats] = useState(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

  // QR creation modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('url'); // 'url' | 'text' | 'image' | 'video'
  const [createContent, setCreateContent] = useState('');
  const [createFile, setCreateFile] = useState(null);
  const [createExpiry, setCreateExpiry] = useState('never');
  const [createFolderId, setCreateFolderId] = useState('');
  const [createFgColor, setCreateFgColor] = useState('#000000');
  const [createBgColor, setCreateBgColor] = useState('#ffffff');
  const [createMargin, setCreateMargin] = useState(2);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdResult, setCreatedResult] = useState(null); // { shortId, qrCode, viewUrl }

  // QR edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editQR, setEditQR] = useState(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editExpiry, setEditExpiry] = useState('never');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Notifications/Feedback
  const [copiedId, setCopiedId] = useState('');
  const [dashboardError, setDashboardError] = useState('');

  // Load Auth from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('qr_user');
    const storedToken = localStorage.getItem('qr_token');
    
    if (!storedUser || !storedToken) {
      navigate('/auth');
      return;
    }

    setUser(JSON.parse(storedUser));
    setToken(storedToken);
  }, [navigate]);

  // Fetch all dashboard data when token is loaded
  useEffect(() => {
    if (!token) return;
    fetchQRs();
    fetchFolders();
    fetchOverallAnalytics();
    fetchTeamMembers();
  }, [token, activeFolderId]);

  // --- API CALLS ---

  const fetchQRs = async () => {
    try {
      let url = `${API_BASE_URL}/api/my-qrs`;
      if (activeFolderId) {
        url += `?folderId=${activeFolderId}`;
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setQrs(data.qrs);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/folders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setFolders(data.folders);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOverallAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setWorkspaceStats(data.analytics);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/workspaces/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle user subscription plan (Free vs Premium simulation)
  const handleTogglePlan = async () => {
    if (!user) return;
    const targetPlan = user.plan === 'free' ? 'premium' : 'free';
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan: targetPlan })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        localStorage.setItem('qr_user', JSON.stringify(data.user));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Folder
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newFolderName })
      });
      const data = await res.json();
      if (res.ok) {
        setFolders(prev => [...prev, data.folder]);
        setNewFolderName('');
        setShowFolderModal(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Folder
  const handleDeleteFolder = async (folderId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this folder? QR Codes inside will be kept but set to uncategorized.')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setFolders(prev => prev.filter(f => f.id !== folderId));
        if (activeFolderId === folderId) {
          setActiveFolderId(null);
        }
        fetchQRs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete QR Code
  const handleDeleteQR = async (shortId) => {
    if (!window.confirm('Are you sure you want to delete this QR Code campaign? All scan analytics for it will be lost.')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/qr/${shortId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setQrs(prev => prev.filter(q => q.shortId !== shortId));
        fetchOverallAnalytics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Invite Team member
  const handleInviteMember = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    if (!inviteEmail.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/workspaces/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      const data = await res.json();
      if (res.ok) {
        setMembers(prev => [...prev, data.member]);
        setInviteSuccess(`Successfully invited ${inviteEmail}!`);
        setInviteEmail('');
      } else {
        setInviteError(data.error || 'Failed to invite user.');
      }
    } catch (err) {
      setInviteError('An error occurred during invitation.');
    }
  };

  // Remove member from workspace
  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this user from your collaborative workspace?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/workspaces/members/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setMembers(prev => prev.filter(m => m.user_id !== userId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch single QR analytics and open modal
  const handleOpenQRAnalytics = async (qr) => {
    setSelectedQR(qr);
    setShowAnalyticsModal(true);
    setSelectedQRStats(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/qr/${qr.shortId}/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedQRStats(data.analytics);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create QR Code
  const handleCreateQR = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);
    setCreatedResult(null);

    try {
      const formData = new FormData();
      formData.append('type', createType);
      formData.append('name', createName || `QR Campaign ${Date.now()}`);
      formData.append('expiryHours', createExpiry);
      formData.append('folderId', createFolderId);
      
      const design = { fgColor: createFgColor, bgColor: createBgColor, margin: createMargin };
      formData.append('qrDesign', JSON.stringify(design));

      if (createType === 'url' || createType === 'text') {
        if (!createContent.trim()) {
          throw new Error('Please fill in the text/URL content field.');
        }
        formData.append('content', createContent);
      } else {
        if (!createFile) {
          throw new Error('Please select an image or video file to upload.');
        }
        formData.append('file', createFile);
      }

      const res = await fetch(`${API_BASE_URL}/api/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        setCreatedResult(data);
        fetchQRs();
        fetchOverallAnalytics();
        // Clear creation form values
        setCreateName('');
        setCreateContent('');
        setCreateFile(null);
      } else {
        setCreateError(data.error || 'Failed to generate QR Code.');
      }
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (qr) => {
    setEditQR(qr);
    setEditName(qr.name || '');
    setEditContent(qr.type === 'url' || qr.type === 'text' ? qr.content || '' : '');
    setEditFolderId(qr.folderId || '');
    // Expiry calculation
    setEditExpiry('never');
    setShowEditModal(true);
  };

  // Save QR Code Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditLoading(true);

    try {
      const body = {
        name: editName,
        folderId: editFolderId || null,
        expiryHours: editExpiry
      };
      
      if (editQR.type === 'url' || editQR.type === 'text') {
        body.content = editContent;
      }

      const res = await fetch(`${API_BASE_URL}/api/qr/${editQR.shortId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (res.ok) {
        setShowEditModal(false);
        fetchQRs();
      } else {
        setEditError(data.error || 'Failed to update campaign.');
      }
    } catch (err) {
      setEditError('An error occurred during update.');
    } finally {
      setEditLoading(false);
    }
  };

  // --- HELPER HANDLERS ---

  const handleCopyLink = async (url, id) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadQR = async (qr) => {
    try {
      const design = qr.qrDesign || {};
      const downloadUrl = await QRCode.toDataURL(`${window.location.origin}/r/${qr.shortId}`, {
        color: {
          dark: design.fgColor || '#000000',
          light: design.bgColor || '#ffffff'
        },
        margin: design.margin !== undefined ? design.margin : 2,
        width: 600,
        errorCorrectionLevel: 'H'
      });
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `qr-code-${qr.shortId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('qr_token');
    localStorage.removeItem('qr_user');
    navigate('/auth');
  };

  // Render horizontal bar chart rows for categories
  const renderCategoryBars = (categories, total) => {
    if (!categories || categories.length === 0) {
      return <p className="no-data-text">No scans tracked yet.</p>;
    }
    
    return (
      <div className="category-bars">
        {categories.map(item => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div className="category-row" key={item.name}>
              <div className="category-info">
                <span>{item.name}</span>
                <span>{item.value} ({pct.toFixed(1)}%)</span>
              </div>
              <div className="category-bar-bg">
                <div className="category-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render simple CSS vertical bar timeline chart
  const renderTimelineChart = (timeline) => {
    if (!timeline || timeline.length === 0) {
      return <div className="no-data-chart">No scan history recorded in the last 30 days.</div>;
    }

    const maxVal = Math.max(...timeline.map(t => t.value), 1);
    
    return (
      <div className="timeline-chart-outer">
        <div className="timeline-chart-flex">
          {timeline.map((item, idx) => {
            const pct = (item.value / maxVal) * 100;
            return (
              <div className="timeline-bar-col" key={idx}>
                <div className="timeline-bar-tooltip">{item.value} scans ({item.date})</div>
                <div className="timeline-bar-track">
                  <div className="timeline-bar-fill" style={{ height: `${pct}%` }} />
                </div>
                <div className="timeline-bar-date">{item.date.substring(5)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (!user) return null;

  return (
    <div className="dashboard-layout">
      {/* Side Navigation Bar */}
      <div className="dashboard-sidebar">
        <div className="sidebar-brand">
          <span className="brand-logo">ME-QR</span>
          <span className="brand-suffix">Dashboard</span>
        </div>

        <div className="sidebar-menu">
          <button 
            className={`sidebar-link ${activeTab === 'qrs' ? 'active' : ''}`}
            onClick={() => setActiveTab('qrs')}
          >
            <Link2 size={18} />
            My QR Campaigns
          </button>
          
          <button 
            className={`sidebar-link ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart2 size={18} />
            Overall Analytics
          </button>

          <button 
            className={`sidebar-link ${activeTab === 'team' ? 'active' : ''}`}
            onClick={() => setActiveTab('team')}
          >
            <UserPlus size={18} />
            Team members
          </button>
        </div>

        {/* Folders Management section in Sidebar */}
        <div className="sidebar-section-header">
          <span>Folders ({folders.length})</span>
          <button className="add-folder-btn" onClick={() => setShowFolderModal(true)}>
            <Plus size={14} />
          </button>
        </div>

        <div className="sidebar-folders">
          <button 
            className={`folder-link ${activeFolderId === null ? 'active' : ''}`}
            onClick={() => setActiveFolderId(null)}
          >
            <Folder size={16} />
            <span>All QR Codes</span>
            <span className="folder-count">{qrs.length}</span>
          </button>

          {folders.map(f => (
            <button 
              key={f.id}
              className={`folder-link ${activeFolderId === f.id ? 'active' : ''}`}
              onClick={() => setActiveFolderId(f.id)}
            >
              <Folder size={16} />
              <span className="folder-name-text">{f.name}</span>
              <Trash2 size={14} className="folder-delete-icon" onClick={(e) => handleDeleteFolder(f.id, e)} />
            </button>
          ))}
        </div>

        {/* Footer Account Status */}
        <div className="sidebar-footer">
          <div className="user-profile-info">
            <p className="profile-name">{user.name}</p>
            <span className={`plan-badge ${user.plan}`}>
              {user.plan.toUpperCase()} TIER
            </span>
          </div>

          <div className="footer-actions">
            <button className="btn-toggle-plan" onClick={handleTogglePlan}>
              Toggle Plan
            </button>
            <button className="logout-btn" onClick={handleLogout} title="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Dashboard Dashboard Content */}
      <div className="dashboard-content">
        <div className="content-header">
          <div>
            <h1>{activeTab === 'qrs' ? 'QR Code Campaigns' : activeTab === 'analytics' ? 'Workspace Analytics' : 'Multi-User Access'}</h1>
            <p className="content-subtitle">
              {activeTab === 'qrs' 
                ? `Showing QR Codes inside ${activeFolderId ? folders.find(f => f.id === activeFolderId)?.name || 'Folder' : 'all campaigns'}` 
                : activeTab === 'analytics' 
                ? 'Consolidated visitor metrics across your QR Codes' 
                : 'Manage permissions and edit credentials for team collaborators'}
            </p>
          </div>

          {activeTab === 'qrs' && (
            <button className="btn-primary" onClick={() => { setCreatedResult(null); setShowCreateModal(true); }}>
              <Plus size={18} />
              Create QR Code
            </button>
          )}
        </div>

        {/* Tab 1: QR Codes Campaigns List */}
        {activeTab === 'qrs' && (
          <div className="qrs-list-container">
            {qrs.length === 0 ? (
              <div className="empty-state glass-container">
                <Folder size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <h3>No QR Codes found</h3>
                <p>Create a dynamic link, text, image, or video QR code to start tracking.</p>
                <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => { setCreatedResult(null); setShowCreateModal(true); }}>
                  Create campaign
                </button>
              </div>
            ) : (
              <div className="qrs-grid">
                {qrs.map(qr => {
                  const targetFolder = folders.find(f => f.id === qr.folderId);
                  const shortUrl = `${window.location.origin}/r/${qr.shortId}`;
                  return (
                    <div className="qr-card glass-container" key={qr.shortId}>
                      <div className="qr-card-header">
                        <span className={`qr-type-badge ${qr.type}`}>{qr.type.toUpperCase()}</span>
                        {targetFolder && <span className="qr-folder-tag"><Folder size={12} /> {targetFolder.name}</span>}
                      </div>

                      <div className="qr-card-body">
                        <h3>{qr.name}</h3>
                        <p className="qr-card-target-text" title={qr.content}>
                          {qr.type === 'url' ? qr.content : qr.type === 'text' ? qr.content : 'Media Resource File'}
                        </p>
                        
                        <div className="qr-card-metric">
                          <span className="metric-label">TOTAL SCANS</span>
                          <span className="metric-val">{qr.scansCount}</span>
                        </div>
                      </div>

                      <div className="qr-card-actions">
                        <button className="card-act-btn" onClick={() => handleOpenQRAnalytics(qr)} title="View Analytics">
                          <BarChart2 size={16} />
                          Stats
                        </button>
                        <button className="card-act-btn" onClick={() => handleOpenEdit(qr)} title="Edit campaign">
                          <Edit2 size={16} />
                          Edit
                        </button>
                        <button className="card-act-btn" onClick={() => handleDownloadQR(qr)} title="Download QR Code">
                          <Download size={16} />
                          Get QR
                        </button>
                        <button className="card-act-btn" onClick={() => handleCopyLink(shortUrl, qr.shortId)} title="Copy Shortlink">
                          {copiedId === qr.shortId ? <Check size={16} style={{ color: '#10b981' }} /> : <Copy size={16} />}
                          {copiedId === qr.shortId ? 'Copied' : 'Link'}
                        </button>
                        <button className="card-act-btn delete-btn" onClick={() => handleDeleteQR(qr.shortId)} title="Delete QR">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Consolidated Analytics Hub */}
        {activeTab === 'analytics' && (
          <div className="analytics-hub-container">
            {/* Quick Cards */}
            <div className="quick-stats-grid">
              <div className="stat-card glass-container">
                <span className="stat-label">TOTAL CAMPAIGNS</span>
                <h2>{workspaceStats.totalQRs}</h2>
                <p>Generated QR codes</p>
              </div>

              <div className="stat-card glass-container">
                <span className="stat-label">TOTAL SCANS IN WORKSPACE</span>
                <h2>{workspaceStats.totalScans}</h2>
                <p>Scanned count history</p>
              </div>
            </div>

            {/* Charts section */}
            <div className="charts-double-row">
              <div className="chart-card glass-container span-2">
                <div className="chart-header">
                  <TrendingUp size={18} />
                  <h3>Scans Activity (Last 30 Days)</h3>
                </div>
                {renderTimelineChart(workspaceStats.scansTimeline)}
              </div>
            </div>

            <div className="charts-grid-row">
              <div className="chart-card glass-container">
                <div className="chart-header">
                  <Monitor size={18} />
                  <h3>Scans by Device</h3>
                </div>
                {renderCategoryBars(workspaceStats.devices, workspaceStats.totalScans)}
              </div>

              <div className="chart-card glass-container">
                <div className="chart-header">
                  <Globe size={18} />
                  <h3>Top Geolocation Countries</h3>
                </div>
                {renderCategoryBars(workspaceStats.countries, workspaceStats.totalScans)}
              </div>

              <div className="chart-card glass-container">
                <div className="chart-header">
                  <Settings size={18} />
                  <h3>Top Browsers</h3>
                </div>
                {renderCategoryBars(workspaceStats.browsers, workspaceStats.totalScans)}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Collaborative Team Workspace */}
        {activeTab === 'team' && (
          <div className="team-container glass-container">
            <h3>Workspace Collaboration</h3>
            <p>Collaborators can view scan analytics and create or edit QR Codes depending on their roles.</p>

            <form onSubmit={handleInviteMember} className="invite-form-row">
              <input 
                type="email" 
                placeholder="collaborator@company.com" 
                className="input-field"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              
              <select 
                className="select-field"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="editor">Editor (Create, Edit)</option>
                <option value="viewer">Viewer (Read Only)</option>
              </select>

              <button type="submit" className="btn-primary">
                <UserPlus size={16} />
                Invite Member
              </button>
            </form>

            {inviteError && <div className="error-message" style={{ marginTop: '0.5rem' }}>{inviteError}</div>}
            {inviteSuccess && <div className="success-message" style={{ marginTop: '0.5rem' }}>{inviteSuccess}</div>}

            <div className="members-list-table">
              <div className="table-header-row">
                <span>Member Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Actions</span>
              </div>

              {members.map(member => (
                <div className="table-data-row" key={member.user_id}>
                  <span>{member.name} {member.user_id === user.id ? '(You)' : ''}</span>
                  <span>{member.email}</span>
                  <span className={`role-badge ${member.role}`}>{member.role.toUpperCase()}</span>
                  <span>
                    {member.user_id !== user.id && (
                      <button className="btn-table-delete" onClick={() => handleRemoveMember(member.user_id)}>
                        Remove
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Create QR Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-card glass-container">
            <div className="modal-header">
              <h2>Generate New Campaign QR</h2>
              <button onClick={() => setShowCreateModal(false)}><X size={20} /></button>
            </div>

            {createError && <div className="error-banner" style={{ margin: '1rem 0' }}><X size={16} />{createError}</div>}

            {!createdResult ? (
              <form onSubmit={handleCreateQR}>
                <div className="form-group">
                  <label className="form-label">Campaign Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Autumn Product Launch" 
                    className="input-field"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Target Type</label>
                  <div className="tabs">
                    <button 
                      type="button" 
                      className={`tab-btn ${createType === 'url' ? 'active' : ''}`}
                      onClick={() => setCreateType('url')}
                    >
                      <Link2 size={14} /> URL
                    </button>
                    <button 
                      type="button" 
                      className={`tab-btn ${createType === 'text' ? 'active' : ''}`}
                      onClick={() => setCreateType('text')}
                    >
                      <FileText size={14} /> Text
                    </button>
                    <button 
                      type="button" 
                      className={`tab-btn ${createType === 'image' ? 'active' : ''}`}
                      onClick={() => setCreateType('image')}
                    >
                      <ImageIcon size={14} /> Image
                    </button>
                    <button 
                      type="button" 
                      className={`tab-btn ${createType === 'video' ? 'active' : ''}`}
                      onClick={() => setCreateType('video')}
                    >
                      <Video size={14} /> Video
                    </button>
                  </div>
                </div>

                {createType === 'url' && (
                  <div className="form-group">
                    <label className="form-label">Destination URL</label>
                    <input 
                      type="url" 
                      placeholder="https://company.com/campaign" 
                      className="input-field"
                      value={createContent}
                      onChange={(e) => setCreateContent(e.target.value)}
                      required
                    />
                  </div>
                )}

                {createType === 'text' && (
                  <div className="form-group">
                    <label className="form-label">Text Content</label>
                    <textarea 
                      placeholder="Enter custom plain text to link..." 
                      className="textarea-field"
                      value={createContent}
                      onChange={(e) => setCreateContent(e.target.value)}
                      required
                    />
                  </div>
                )}

                {(createType === 'image' || createType === 'video') && (
                  <div className="form-group">
                    <label className="form-label">Upload File</label>
                    <input 
                      type="file" 
                      className="input-field" 
                      accept={createType === 'image' ? 'image/*' : 'video/*'}
                      onChange={(e) => setCreateFile(e.target.files[0])}
                      required
                    />
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group col-6">
                    <label className="form-label">Move to Folder</label>
                    <select 
                      className="select-field"
                      value={createFolderId}
                      onChange={(e) => setCreateFolderId(e.target.value)}
                    >
                      <option value="">No Folder (Uncategorized)</option>
                      {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group col-6">
                    <label className="form-label">Expiration Lifetime</label>
                    <select 
                      className="select-field"
                      value={createExpiry}
                      onChange={(e) => setCreateExpiry(e.target.value)}
                    >
                      <option value="never">Unlimited (Never Expires)</option>
                      <option value="1">1 Hour</option>
                      <option value="24">24 Hours</option>
                      <option value="168">7 Days</option>
                    </select>
                  </div>
                </div>

                {/* QR Customizer colors */}
                <div className="customization-panel-wrapper">
                  <h4>QR Colors & Margin Design</h4>
                  <div className="form-row">
                    <div className="form-group col-4">
                      <label className="form-label">Primary Color</label>
                      <input 
                        type="color" 
                        value={createFgColor} 
                        onChange={(e) => setCreateFgColor(e.target.value)} 
                        className="color-picker-input"
                      />
                    </div>
                    <div className="form-group col-4">
                      <label className="form-label">Background</label>
                      <input 
                        type="color" 
                        value={createBgColor} 
                        onChange={(e) => setCreateBgColor(e.target.value)} 
                        className="color-picker-input"
                      />
                    </div>
                    <div className="form-group col-4">
                      <label className="form-label">Margin spacing</label>
                      <input 
                        type="number" 
                        min="0" 
                        max="10" 
                        value={createMargin} 
                        onChange={(e) => setCreateMargin(parseInt(e.target.value, 10))} 
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" className="btn-primary modal-submit-btn" disabled={createLoading}>
                  {createLoading ? <div className="spinner" /> : 'Generate QR Code'}
                </button>
              </form>
            ) : (
              <div className="create-qr-result-preview" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <h3 style={{ color: '#10b981' }}>Successfully Generated!</h3>
                <div className="qr-image-wrapper" style={{ margin: '1.5rem auto' }}>
                  <img src={createdResult.qrCode} alt="Generated QR" className="qr-image" style={{ width: '220px', height: '220px' }} />
                </div>
                <div className="qr-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <a href={createdResult.qrCode} download={`qr-code-${createdResult.shortId}.png`} className="btn-primary" style={{ textDecoration: 'none' }}>
                    <Download size={16} /> Download
                  </a>
                  <button className="btn-secondary" onClick={() => handleCopyLink(createdResult.viewUrl, createdResult.shortId)}>
                    {copiedId === createdResult.shortId ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: Edit QR Campaign */}
      {showEditModal && editQR && (
        <div className="modal-overlay">
          <div className="modal-card glass-container">
            <div className="modal-header">
              <h2>Edit Campaign: {editQR.name}</h2>
              <button onClick={() => setShowEditModal(false)}><X size={20} /></button>
            </div>

            {editError && <div className="error-banner" style={{ margin: '1rem 0' }}><X size={16} />{editError}</div>}

            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label">Campaign Name</label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              {(editQR.type === 'url' || editQR.type === 'text') && (
                <div className="form-group">
                  <label className="form-label">Target Content (Edit Dynamically)</label>
                  {editQR.type === 'url' ? (
                    <input 
                      type="url" 
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="input-field"
                      required
                    />
                  ) : (
                    <textarea 
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="textarea-field"
                      required
                    />
                  )}
                </div>
              )}

              <div className="form-row">
                <div className="form-group col-6">
                  <label className="form-label">Change Folder</label>
                  <select 
                    className="select-field"
                    value={editFolderId}
                    onChange={(e) => setEditFolderId(e.target.value)}
                  >
                    <option value="">Uncategorized (No Folder)</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group col-6">
                  <label className="form-label">Reset Expiry hours</label>
                  <select 
                    className="select-field"
                    value={editExpiry}
                    onChange={(e) => setEditExpiry(e.target.value)}
                  >
                    <option value="never">Never Expire (Keep Active)</option>
                    <option value="1">1 Hour (from now)</option>
                    <option value="24">24 Hours (from now)</option>
                    <option value="168">7 Days (from now)</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary modal-submit-btn" disabled={editLoading}>
                {editLoading ? <div className="spinner" /> : 'Save Updates'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Detailed Individual QR Scan Analytics */}
      {showAnalyticsModal && selectedQR && (
        <div className="modal-overlay">
          <div className="modal-card glass-container span-analytics-modal">
            <div className="modal-header">
              <h2>Campaign Metrics: {selectedQR.name}</h2>
              <button onClick={() => setShowAnalyticsModal(false)}><X size={20} /></button>
            </div>

            {!selectedQRStats ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                <p>Loading visitors metrics data...</p>
              </div>
            ) : (
              <div className="analytics-modal-body">
                {/* Headline Metrics */}
                <div className="quick-stats-grid">
                  <div className="stat-card glass-container">
                    <span className="stat-label">TOTAL REDIRECTS SCANNED</span>
                    <h2>{selectedQRStats.totalScans}</h2>
                  </div>
                  <div className="stat-card glass-container">
                    <span className="stat-label">CAMPAIGN TYPE</span>
                    <h2>{selectedQR.type.toUpperCase()}</h2>
                  </div>
                </div>

                {/* Timeline */}
                <div className="chart-card glass-container" style={{ margin: '1.5rem 0' }}>
                  <div className="chart-header">
                    <TrendingUp size={16} />
                    <span>Scan Traffic Over-Time</span>
                  </div>
                  {renderTimelineChart(selectedQRStats.scansTimeline)}
                </div>

                {/* Categories */}
                <div className="charts-grid-row">
                  <div className="chart-card glass-container">
                    <div className="chart-header">
                      <Monitor size={16} />
                      <span>Device Distribution</span>
                    </div>
                    {renderCategoryBars(selectedQRStats.devices, selectedQRStats.totalScans)}
                  </div>

                  <div className="chart-card glass-container">
                    <div className="chart-header">
                      <Globe size={16} />
                      <span>Scan Country Location</span>
                    </div>
                    {renderCategoryBars(selectedQRStats.countries, selectedQRStats.totalScans)}
                  </div>

                  <div className="chart-card glass-container">
                    <div className="chart-header">
                      <Settings size={16} />
                      <span>Visitor Browsers</span>
                    </div>
                    {renderCategoryBars(selectedQRStats.browsers, selectedQRStats.totalScans)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: Folder Add Modal */}
      {showFolderModal && (
        <div className="modal-overlay">
          <div className="modal-card glass-container" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Add Folder</h2>
              <button onClick={() => setShowFolderModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateFolder} style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Folder Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Sales, Marketing" 
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary modal-submit-btn" style={{ marginTop: '1rem' }}>
                Create Folder
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
