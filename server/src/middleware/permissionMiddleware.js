export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.isAdmin || req.user.role === 'AKR' || req.user.role === 'CKG') {
    return next();
  }

  return res.status(403).json({ error: 'Administrator access required (AKR or CKG role).' });
}

export function requireAreaEdit(getAreaFromReq) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Master admins can edit anything
    if (req.user.isAdmin || req.user.role === 'AKR' || req.user.role === 'CKG') {
      return next();
    }

    const targetArea = typeof getAreaFromReq === 'function' ? getAreaFromReq(req) : req.params.area || req.body.area;

    if (!targetArea) {
      return next(); // Default pass if no specific area targeted
    }

    // Area lead can edit only their area
    if (req.user.role === targetArea) {
      return next();
    }

    return res.status(403).json({
      error: `Permission denied. User with role '${req.user.role}' cannot edit data for area '${targetArea}'.`
    });
  };
}
