const prisma = require("../config/prisma");
const { checkDatabaseHealth } = require("../utils/databaseHealth");
const { getFallbackBookings, getAllFallbackData } = require("../utils/fallbackStorage");

// Admin Dashboard Stats
exports.getDashboardStats = async (req, res) => {
  try {
    // Check if database is available and healthy
    if (prisma._hasRealDatabase && await checkDatabaseHealth(prisma)) {
      try {
        // Get real stats from database
        const [
          totalBookings,
          totalRevenue,
          totalScans,
          pendingBookings,
          todayBookings,
          todayRevenue,
          todayScans,
          failedScans
        ] = await Promise.all([
          prisma.booking.count(),
          prisma.booking.aggregate({
            _sum: { final_amount: true }
          }),
          prisma.qrCode.count({
            where: { is_used: true }
          }),
          prisma.booking.count({
            where: { status: 'pending' }
          }),
          prisma.booking.count({
            where: {
              booking_date: {
                gte: new Date(new Date().setHours(0, 0, 0, 0))
              }
            }
          }),
          prisma.booking.aggregate({
            _sum: { final_amount: true },
            where: {
              booking_date: {
                gte: new Date(new Date().setHours(0, 0, 0, 0))
              }
            }
          }),
          prisma.qrCode.count({
            where: {
              is_used: true,
              used_at: {
                gte: new Date(new Date().setHours(0, 0, 0, 0))
              }
            }
          }),
          prisma.qrCode.count({
            where: {
              is_used: false,
              expiry_date: {
                lt: new Date()
              }
            }
          })
        ]);

        const stats = {
          totalBookings: totalBookings,
          totalTickets: totalBookings,
          totalRevenue: totalRevenue._sum.final_amount || 0,
          totalScans: totalScans,
          scannedTickets: totalScans,
          failedScans: failedScans,
          pendingBookings: pendingBookings,
          todayBookings: todayBookings,
          todayRevenue: todayRevenue._sum.final_amount || 0,
          todayScans: todayScans,
          activeStaff: 0
        };

        console.log('📊 Returning real dashboard stats from database');
        res.json({ 
          success: true, 
          data: stats,
          mock: false
        });
      } catch (dbError) {
        console.log('⚠️ Database query failed, returning empty stats:', dbError.message);
        return res.json({ 
          success: true, 
          data: {
            totalBookings: 0, totalTickets: 0, totalRevenue: 0,
            totalScans: 0, scannedTickets: 0, failedScans: 0,
            pendingBookings: 0, todayBookings: 0, todayRevenue: 0,
            todayScans: 0, activeStaff: 0
          },
          mock: false,
          message: "Database query failed - showing empty data"
        });
      }
    } else {
      // Database not available or unhealthy - return fallback stats
      console.log('⚠️ Database unavailable - returning fallback stats');
      const fallbackData = getAllFallbackData();
      
      const fallbackStats = {
        totalBookings: fallbackData.stats.totalBookings,
        totalTickets: fallbackData.stats.totalBookings, // Assuming 1 ticket per booking for simplicity
        totalRevenue: fallbackData.bookings.reduce((total, booking) => total + (booking.final_amount || 0), 0),
        totalScans: 0, // No scans yet in fallback mode
        scannedTickets: 0,
        failedScans: 0,
        pendingBookings: fallbackData.bookings.filter(b => b.status === 'pending').length,
        todayBookings: fallbackData.bookings.filter(b => {
          const today = new Date().toDateString();
          return new Date(b.created_at).toDateString() === today;
        }).length,
        todayRevenue: fallbackData.bookings.filter(b => {
          const today = new Date().toDateString();
          return new Date(b.created_at).toDateString() === today;
        }).reduce((total, booking) => total + (booking.final_amount || 0), 0),
        todayScans: 0,
        activeStaff: 0
      };
      
      res.json({ 
        success: true, 
        data: fallbackStats,
        mock: true,
        message: `Database unavailable - showing stats for ${fallbackData.stats.totalBookings} offline bookings`
      });
    }
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch dashboard stats',
      details: error.message 
    });
  }
};

// Admin Recent Scans
exports.getRecentScans = async (req, res) => {
  try {
    // Check if database is available and healthy
    if (prisma._hasRealDatabase && await checkDatabaseHealth(prisma)) {
      try {
        const recentScans = await prisma.qrCode.findMany({
          where: {
            is_used: true,
            used_at: { not: null }
          },
          include: {
            user: { select: { name: true } },
            booking: { select: { id: true } }
          },
          orderBy: { used_at: 'desc' },
          take: 10
        });

        const formattedScans = recentScans.map(scan => ({
          id: scan.id,
          ticket_number: scan.unique_code,
          status: 'scanned',
          created_at: scan.used_at,
          user_name: scan.user.name,
          booking_id: Number(scan.booking.id)
        }));

        console.log('🔍 Returning real recent scans from database');
        res.json({ 
          success: true, 
          data: formattedScans,
          mock: false
        });
      } catch (dbError) {
        console.log('⚠️ Database query failed, returning empty scans:', dbError.message);
        return res.json({ 
          success: true, 
          data: [],
          mock: false,
          message: "Database query failed - showing empty data"
        });
      }
    } else {
      // Database not available or unhealthy
      console.log('⚠️ Database unavailable or unhealthy - returning empty scans');
      res.json({ 
        success: true, 
        data: [],
        mock: false,
        message: "Database unavailable - showing empty data"
      });
    }
  } catch (error) {
    console.error('Error in getRecentScans:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch recent scans',
      details: error.message 
    });
  }
};

// Admin Chart Data
exports.getChartData = async (req, res) => {
  try {
    // Check if database is available and healthy
    if (prisma._hasRealDatabase && await checkDatabaseHealth(prisma)) {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const bookingsData = await prisma.booking.groupBy({
          by: ['booking_date'],
          _count: { id: true },
          _sum: { final_amount: true },
          where: {
            booking_date: { gte: sevenDaysAgo }
          },
          orderBy: { booking_date: 'asc' }
        });

        const chartData = bookingsData.map(day => ({
          date: day.booking_date.toISOString().split('T')[0],
          bookings: day._count.id,
          revenue: day._sum.final_amount || 0
        }));

        console.log('📈 Returning real chart data from database');
        res.json({ 
          success: true, 
          data: chartData,
          mock: false
        });
      } catch (dbError) {
        console.log('⚠️ Database query failed, returning empty chart data:', dbError.message);
        return res.json({ 
          success: true, 
          data: [],
          mock: false,
          message: "Database query failed - showing empty data"
        });
      }
    } else {
      // Database not available or unhealthy
      console.log('⚠️ Database unavailable or unhealthy - returning empty chart data');
      res.json({ 
        success: true, 
        data: [],
        mock: false,
        message: "Database unavailable - showing empty data"
      });
    }
  } catch (error) {
    console.error('Error in getChartData:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch chart data',
      details: error.message 
    });
  }
};

// Test endpoint for admin panel
exports.testAdminEndpoint = async (req, res) => {
  res.json({ 
    success: true, 
    message: "Admin endpoint working!",
    timestamp: new Date().toISOString()
  });
};

// Admin Bookings
exports.getBookings = async (req, res) => {
  try {
    // Check if database is available and healthy
    if (prisma._hasRealDatabase && await checkDatabaseHealth(prisma)) {
      try {
        const bookings = await prisma.booking.findMany({
          include: {
            users: true,
            payments: true
          },
          orderBy: { created_at: 'desc' },
          take: 50 // Limit to last 50 bookings
        });

        // Flatten user data to match admin component expectations
        const flattenedBookings = bookings.map(booking => {
          const primaryUser = booking.users.find(u => u.is_primary) || booking.users[0];
          return {
            ...booking,
            full_name: primaryUser?.name || 'N/A',
            email: primaryUser?.email || 'N/A',
            phone: primaryUser?.phone || 'N/A',
            quantity: booking.num_tickets,
            payment_status: booking.payments?.[0]?.status || 'pending'
          };
        });

        console.log('📋 Returning real bookings from database');
        res.json({ 
          success: true, 
          data: flattenedBookings,
          mock: false
        });
      } catch (dbError) {
        console.log('⚠️ Database query failed, returning empty bookings:', dbError.message);
        return res.json({ 
          success: true, 
          data: [],
          mock: false,
          message: "Database query failed - showing empty data"
        });
      }
    } else {
      // Database not available or unhealthy - return fallback bookings
      console.log('⚠️ Database unavailable - returning fallback bookings');
      const fallbackBookings = getFallbackBookings();
      
      // Flatten user data to match admin component expectations
      const flattenedFallbackBookings = fallbackBookings.map(booking => {
        const primaryUser = booking.users?.find(u => u.is_primary) || booking.users?.[0];
        return {
          ...booking,
          full_name: primaryUser?.name || booking.full_name || 'N/A',
          email: primaryUser?.email || booking.email || 'N/A', 
          phone: primaryUser?.phone || booking.phone || 'N/A',
          quantity: booking.num_tickets || booking.quantity || 1,
          payment_status: booking.payments?.[0]?.status || booking.payment_status || 'pending'
        };
      });
      
      res.json({ 
        success: true, 
        data: flattenedFallbackBookings,
        mock: true,
        message: `Database unavailable - showing ${flattenedFallbackBookings.length} offline bookings`
      });
    }
  } catch (error) {
    console.error('Error in getBookings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch bookings',
      details: error.message 
    });
  }
};

// Admin Scans
exports.getScans = async (req, res) => {
  try {
    // Check if database is available and healthy
    if (prisma._hasRealDatabase && await checkDatabaseHealth(prisma)) {
      try {
        const scans = await prisma.qrCode.findMany({
          include: {
            user: { select: { name: true } },
            booking: { select: { id: true } }
          },
          orderBy: { created_at: 'desc' },
          take: 100 // Limit to last 100 scans
        });

        console.log('🔍 Returning real scans from database');
        res.json({ 
          success: true, 
          data: scans,
          mock: false
        });
      } catch (dbError) {
        console.log('⚠️ Database query failed, returning empty scans:', dbError.message);
        return res.json({ 
          success: true, 
          data: [],
          mock: false,
          message: "Database query failed - showing empty data"
        });
      }
    } else {
      // Database not available or unhealthy
      console.log('⚠️ Database unavailable or unhealthy - returning empty scans');
      res.json({ 
        success: true, 
        data: [],
        mock: false,
        message: "Database unavailable - showing empty data"
      });
    }
  } catch (error) {
    console.error('Error in getScans:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch scans',
      details: error.message 
    });
  }
};
