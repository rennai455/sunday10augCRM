const jwt = require('jsonwebtoken');
const config = require('../config');
const { JWT_SECRET } = config;

const DEMO_SESSION_VALUE = 'demo-session';
const DEMO_USER = {
  email: 'admin@renn.ai',
  agency: 'Demo Agency',
  role: 'admin',
  isAdmin: true,
};

function applyDemoSession(req) {
  const session = req.cookies?.auth;
  if (session === DEMO_SESSION_VALUE) {
    req.userId = null;
    req.agencyId = null;
    req.isAdmin = true;
    req.demoUser = { ...DEMO_USER };
    return true;
  }
  return false;
}

const auth = async (req, res, next) => {
  if (applyDemoSession(req)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : cookieToken;

  if (!token) {
    return res.status(401).json({ error: 'No authentication token' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.agencyId = payload.agencyId;
    req.isAdmin = payload.isAdmin;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authenticateWeb = (req, res, next) => {
  if (applyDemoSession(req)) {
    return next();
  }

  const token = req.cookies?.token;
  if (!token) {
    return res.redirect('/Login.html');
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.agencyId = payload.agencyId;
    req.isAdmin = payload.isAdmin;
    next();
  } catch {
    res.redirect('/Login.html');
  }
};

module.exports = { auth, authenticateWeb, DEMO_SESSION_VALUE, DEMO_USER };
