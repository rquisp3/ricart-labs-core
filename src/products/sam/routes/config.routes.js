const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/configController');

router.get('/public', ctrl.getPublicConfig);

module.exports = router;