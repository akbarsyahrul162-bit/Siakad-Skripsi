const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'siakad_fallback_secret_key_2026';

function requireAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Sesi telah berakhir atau Anda belum login.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token otentikasi tidak valid.' });
  }
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Akses ditolak: Anda tidak memiliki wewenang.' });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  JWT_SECRET,
};
