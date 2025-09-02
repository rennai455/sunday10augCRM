const express = require('express');

const router = express.Router();

// Authorization middleware
router.use((req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Placeholder route
router.get('/campaigns/:id', (req, res) => {
  res.json({ id: req.params.id });
});

module.exports = router;
