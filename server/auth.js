import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'insecure-dev-secret-change-me';
const TOKEN_TTL = process.env.JWT_TTL || '12h';

export const ROLES = ['admin', 'manager', 'supervisor', 'customer'];

/* Role → permission ceiling (see the docs table). */
export const ROLE_RANK = { admin: 4, manager: 3, supervisor: 2, customer: 1 };

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, customerId: user.customerId || null, name: user.name },
    SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Session expired' });
  }
}

/* Require a minimum role rank. */
export function roleAtLeast(rank) {
  return (req, res, next) => {
    const have = ROLE_RANK[req.user.role] ?? 0;
    if (have < rank) return res.status(403).json({ ok: false, error: 'Forbidden' });
    next();
  };
}
