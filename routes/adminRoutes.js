const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Admin Dashboard Routes
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/recent-scans', adminController.getRecentScans);
router.get('/dashboard/chart-data', adminController.getChartData);

// Admin Bookings Routes
router.get('/bookings', adminController.getBookings);

// Admin Scans Routes  
router.get('/scans', adminController.getScans);

module.exports = router;
