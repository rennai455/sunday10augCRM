const jwt = require('jsonwebtoken');
const config = require('../config');
const { JWT_SECRET } = config;

const auth = async (req, res, next) => {
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
  const token = req.cookies?.token;
  if (!token) {
    return res.redirect('/Login.html');
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.redirect('/Login.html');
  }
};

module.exports = { auth, authenticateWeb };
