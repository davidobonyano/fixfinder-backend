# FixFinder Verification Setup Guide

## 📧 Email Verification (Already Configured!)

Your Mailtrap setup is perfect for development:

```env
MAIL_HOST=sandbox.smtp.mailtrap.io
MAIL_PORT=587
MAIL_USER=e93fa2db44fbe3
MAIL_PASS=1c1df19d5d016b
MAIL_FROM="FixFinder <no-reply@fixfinder.local>"
```

### For Production (Gmail):
```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-fixfinder-email@gmail.com
MAIL_PASS=your-app-password
MAIL_FROM="FixFinder <your-fixfinder-email@gmail.com>"
```

**Gmail Setup Steps:**
1. Create Gmail account: `fixfinder.app@gmail.com`
2. Enable 2-Factor Authentication
3. Generate App Password: Google Account → Security → App passwords
4. Use App Password (not regular password) in MAIL_PASS

## 📱 Phone Verification Setup

### Option 1: Twilio (Recommended - Global)
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

**Twilio Setup:**
1. Sign up at [twilio.com](https://twilio.com)
2. Get Account SID and Auth Token from Console
3. Buy a phone number ($1/month)
4. Add credentials to .env

**Cost:** ~$0.0075 per SMS

### Option 2: Termii (Nigerian - Better Rates)
```env
TERMII_API_KEY=your_api_key
TERMII_SENDER_ID=FixFinder
```

**Termii Setup:**
1. Sign up at [termii.com](https://termii.com)
2. Get API key from dashboard
3. Add credentials to .env

**Cost:** ~$0.002 per SMS (Nigerian numbers)

### Option 3: SendChamp (Nigerian - Best Rates)
```env
SENDCHAMP_API_KEY=your_api_key
SENDCHAMP_SENDER_NAME=FixFinder
```

**SendChamp Setup:**
1. Sign up at [sendchamp.com](https://sendchamp.com)
2. Get API key from dashboard
3. Add credentials to .env

**Cost:** ~$0.0015 per SMS (Nigerian numbers)

## 🧪 Testing Verification

### Test Email Verification:
```bash
curl -X POST http://localhost:3000/api/users/send-email-verification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### Test Phone Verification:
```bash
curl -X POST http://localhost:3000/api/users/send-phone-verification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone": "09035526146"}'
```

## 🔧 Current Status

✅ **Email Verification:** Ready (Mailtrap configured)
✅ **Phone Verification:** Ready (Console logging + SMS providers)
✅ **Password Change:** Ready
✅ **Rate Limiting:** 3 attempts/hour for phone
✅ **Token Expiry:** 24h for email, 10min for phone

## 🚀 Production Checklist

- [ ] Configure production email (Gmail/SendGrid)
- [ ] Choose SMS provider (Twilio/Termii/SendChamp)
- [ ] Add SMS credentials to .env
- [ ] Test all verification flows
- [ ] Set up monitoring for failed sends
- [ ] Configure rate limiting for production

## 📊 Cost Estimates (Monthly)

**For 1000 users:**
- Email: ~$0 (Gmail free tier)
- SMS (Twilio): ~$7.50
- SMS (Termii): ~$2.00
- SMS (SendChamp): ~$1.50

**Recommendation:** Use Termii or SendChamp for Nigerian numbers (much cheaper!)




