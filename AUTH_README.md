# Email/Password Authentication (OTP + JWT cookie)

This project now has a working, secure, minimal auth system.

## Required environment variables
- PORT: number (e.g., 5000)
- FRONTEND_ORIGIN: URL of frontend (e.g., https://your-site.netlify.app) for CORS
- DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT
- JWT_SECRET: random string; rotate regularly
- JWT_EXPIRES_IN: short expiry (e.g., 15m)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
- FROM_EMAIL: from address used to send OTP mail

Do not commit .env files. Rotate secrets if leaked.

## Database migrations
- File: migrations/001_create_auth_tables.sql
- Apply using any MySQL client, for example:
  - mysql -h %DB_HOST% -u %DB_USER% -p%DB_PASSWORD% %DB_NAME% < migrations/001_create_auth_tables.sql

## Backend setup
- Install dependencies (root runs backend/server.js):
  - npm install
- Start locally:
  - npm start

## Frontend setup
- Netlify build can replace %%BACKEND_URL%% in js/main.js using an environment variable for the backend base URL.
- Ensure meta tag <meta name="api-base" content="https://your-backend.example.com"> exists or set %%BACKEND_URL%% at build time.

## Endpoints
- POST /api/auth/signup { email, password }
  - Creates user (is_verified=0), stores hashed password, sends 6-digit OTP email.
- POST /api/auth/verify { email, otp }
  - Verifies OTP, marks user as verified, clears OTP records.
- POST /api/auth/login { email, password }
  - Only for verified users. On success, sets httpOnly SameSite=Strict cookie `access_token` and returns { user }.
- POST /api/auth/resend-otp { email }
  - Rate-limited; sends a new OTP for unverified user.

## Testing with curl
- Signup (OTP will be emailed; in dev mailer may log to provider):
  - curl -i -X POST %BACKEND%/api/auth/signup -H "Content-Type: application/json" -d "{\"email\":\"user@example.com\",\"password\":\"P@ssw0rd!\"}"
- Verify:
  - curl -i -X POST %BACKEND%/api/auth/verify -H "Content-Type: application/json" -d "{\"email\":\"user@example.com\",\"otp\":\"123456\"}"
- Login (store cookie):
  - curl -i -c cookies.txt -X POST %BACKEND%/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"user@example.com\",\"password\":\"P@ssw0rd!\"}"
- Authenticated request example (with cookie):
  - curl -b cookies.txt %BACKEND%/health

## Postman collection
- See docs/postman_collection.json

## Security notes
- Never store JWT in localStorage; this implementation uses httpOnly cookies.
- Keep JWT expiry short (e.g., 15 minutes). Consider adding refresh tokens or short sessions as a future improvement.
- Use strong passwords: minimum 8 chars with at least 1 letter, 1 digit, 1 symbol.
- Validate emails client- and server-side.
- Always rotate any leaked secrets immediately.
- Enforce CORS to allow only your frontend origin in production.
