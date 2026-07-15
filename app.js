import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authMiddleware } from './auth.js';

import authRoutes from './routes/auth.js';
import fleetRoutes from './routes/fleet.js';
import opportunityRoutes from './routes/opportunities.js';
import exceptionRoutes from './routes/exceptions.js';
import workbookRoutes from './routes/workbook.js';
import editorRoutes from './routes/editors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(authMiddleware);

  app.use('/api/auth', authRoutes);
  app.use('/api/fleet', fleetRoutes);
  app.use('/api/opportunities', opportunityRoutes);
  app.use('/api/exceptions', exceptionRoutes);
  app.use('/api/workbook', workbookRoutes);
  app.use('/api/editors', editorRoutes);

  app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // Serve the built client (production) if present.
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Unexpected server error.', detail: err.message });
  });

  return app;
}
