import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

// ── Storage config ──────────────────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Ensure upload directories exist
['vehicles', 'library'].forEach(dir => {
  const fullPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(UPLOAD_DIR, 'vehicles'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and HEIC images are allowed'));
    }
  },
});

// ── Routes ──────────────────────────────────────────────────────────────────

const router = Router();

// Upload one or more vehicle images (requires auth)
router.post('/vehicle-images', (req: Request, res: Response, next: NextFunction) => {
  // Accept auth token OR admin key
  const adminKey = req.headers['x-admin-key'];
  const authHeader = req.headers.authorization;
  if (!adminKey && !authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return next();
}, upload.array('images', 8), (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No images uploaded' });
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const urls = files.map(f => `${baseUrl}/uploads/vehicles/${f.filename}`);

  logger.info('Vehicle images uploaded', { count: files.length });

  return res.json({ urls });
});

// ── Car Library ─────────────────────────────────────────────────────────────

// Get all available library images (grouped by make)
router.get('/library', (_req: Request, res: Response) => {
  const libraryDir = path.join(UPLOAD_DIR, 'library');

  if (!fs.existsSync(libraryDir)) {
    return res.json({ images: [], makes: [] });
  }

  const makes = fs.readdirSync(libraryDir).filter(f =>
    fs.statSync(path.join(libraryDir, f)).isDirectory()
  );

  const images: Array<{ url: string; make: string; filename: string }> = [];

  for (const make of makes) {
    const makeDir = path.join(libraryDir, make);
    const files = fs.readdirSync(makeDir).filter(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f)
    );
    for (const file of files) {
      images.push({
        url: `/uploads/library/${make}/${file}`,
        make: make.charAt(0).toUpperCase() + make.slice(1),
        filename: file,
      });
    }
  }

  return res.json({ images, makes: makes.map(m => m.charAt(0).toUpperCase() + m.slice(1)) });
});

// Upload images to library (admin)
router.post('/library/:make', (req: Request, res: Response, next: NextFunction) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== (process.env.ADMIN_API_KEY || 'vip-admin-2026')) {
    return res.status(401).json({ error: 'Admin key required' });
  }

  const make = req.params.make.toLowerCase();
  const makeDir = path.join(UPLOAD_DIR, 'library', make);
  if (!fs.existsSync(makeDir)) {
    fs.mkdirSync(makeDir, { recursive: true });
  }

  const libraryStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, makeDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const name = crypto.randomBytes(8).toString('hex') + ext;
      cb(null, name);
    },
  });

  const libraryUpload = multer({
    storage: libraryStorage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only image files allowed'));
    },
  });

  libraryUpload.array('images', 20)(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const urls = files.map(f => `/uploads/library/${make}/${f.filename}`);
    logger.info('Library images uploaded', { make, count: files.length });

    return res.json({ urls, make });
  });
});

export default router;
export { UPLOAD_DIR };
