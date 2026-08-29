import { verifyToken } from '../utils.js';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token is required.' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired authorization token.' });
  }

  req.user = decoded;
  req.workspaceId = `ws_${decoded.id}`;
  next();
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
      req.workspaceId = `ws_${decoded.id}`;
    }
  }
  next();
}
