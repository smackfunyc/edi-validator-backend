/**
 * Root handler — health check
 * GET / → confirms API is live
 */
module.exports = (req, res) => {
  res.json({
    status: 'EDI Validator API',
    version: '1.0.0',
    endpoints: [
      'POST /api/validate',
      'POST /api/ai-explain',
      'POST /api/verify-license',
    ]
  });
};
