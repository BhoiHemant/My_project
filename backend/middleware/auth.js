// middleware/auth.js - JWT verification middleware (prefers httpOnly cookie)
import jwt from 'jsonwebtoken';

export const auth = (req, res, next) => {
  const cookieToken = req.cookies?.token;
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken || bearer;

  if (!token) return res.status(401).json({ message: 'Authorization token missing' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.sub || decoded.id, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const doctorOnly = (req, res, next) => {
  // If role is present and not doctor, block. If role is absent (current schema), allow.
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (typeof req.user.role !== 'undefined' && req.user.role !== 'doctor') {
    return res.status(403).json({ message: 'Unauthorized: doctor access only' });
  }
  next();
};
