# Dandiya Backend

Node.js + Express backend for the Dandiya booking platform.

## Quick Start

```bash
npm install
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=your_database_url
QR_BASE_URL=https://your-backend-domain.com
CORS_ORIGIN=https://your-frontend-domain.com,https://your-admin-domain.com
RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
RESEND_API_KEY=your_resend_key
```

## Deployment

### Railway
1. Connect this repository to Railway
2. Auto-deploys on push to main
3. Add environment variables in Railway dashboard

### Heroku
1. Connect this repository to Heroku
2. Add buildpack: `heroku/nodejs`
3. Add environment variables

### Vercel
1. Connect this repository to Vercel
2. Framework preset: Other
3. Build command: `npm install`
4. Add environment variables

## Database Setup

The backend supports PostgreSQL. Set your `DATABASE_URL` in environment variables.

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/bookings/create` - Create booking
- `GET /api/admin/bookings` - Get all bookings (admin)
- And more...

See the routes directory for all available endpoints.