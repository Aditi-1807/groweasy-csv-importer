require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { parseCsv } = require('./utils/csvParser');
const { extractBatch } = require('./utils/aiExtractor');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend requests
app.use(cors({
  origin: '*', // In production, replace with specific frontend URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Set up JSON body parser with a larger limit to handle bulk row uploads
app.use(express.json({ limit: '10mb' }));

// Set up Multer for memory storage file uploads (max 5MB as per references)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

/**
 * Endpoint to parse a CSV file.
 * Accepts a file field named "file".
 * Returns raw rows for frontend preview.
 */
app.post('/api/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Please upload a valid CSV file.' });
    }

    // Verify it is a CSV file
    const fileExtension = req.file.originalname.split('.').pop().toLowerCase();
    if (fileExtension !== 'csv' && req.file.mimetype !== 'text/csv') {
      return res.status(400).json({ success: false, error: 'Invalid file format. Only CSV files are supported.' });
    }

    const parsedRows = await parseCsv(req.file.buffer);
    
    if (parsedRows.length === 0) {
      return res.status(400).json({ success: false, error: 'The uploaded CSV file is empty.' });
    }

    res.json({
      success: true,
      filename: req.file.originalname,
      count: parsedRows.length,
      rows: parsedRows
    });
  } catch (error) {
    console.error('Error parsing CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to parse the CSV file. Please ensure it is formatted correctly.' });
  }
});

/**
 * Endpoint to map a batch of records to GrowEasy CRM format using AI or Heuristics.
 * Accepts a JSON body containing "rows" array.
 */
app.post('/api/extract', async (req, res) => {
  try {
    const { rows } = req.body;

    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'Invalid request body. "rows" array is required.' });
    }

    if (rows.length === 0) {
      return res.json({ success: true, count: 0, results: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const mode = apiKey ? 'ai' : 'heuristic-fallback';

    // Process the batch
    const results = await extractBatch(rows, apiKey);

    res.json({
      success: true,
      mode: mode,
      count: results.length,
      results: results
    });
  } catch (error) {
    console.error('Error extracting CRM leads:', error);
    res.status(500).json({ success: false, error: 'An error occurred during AI mapping.' });
  }
});

// Serve Next.js static export files
app.use(express.static(path.join(__dirname, '../frontend/out')));

// Wildcard route to handle SPA client-side routing fallback
app.get('*', (req, res, next) => {
  // If the request starts with /api, do not serve index.html
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../frontend/out', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log('WARNING: GEMINI_API_KEY is not set. Running in smart Heuristic Fallback Mode.');
  } else {
    console.log('Gemini AI processing is active.');
  }
});
