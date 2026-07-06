import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';

const router = Router();

router.get('/me', requireAuth, (req, res) => res.json(req.usuario));

export default router;
