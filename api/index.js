import app from '../src/server.js';

export default function handler(req, res) {
  try {
    return app(req, res);
  } catch (err) {
    console.error('Fatal Serverless Function Invocation Error:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'Fatal function invocation error'
    });
  }
}
