const nodemailer = require("nodemailer");
let ResendClient = null;
try {
  // Lazy optional import to avoid hard crash if package is missing during dev
  ResendClient = require('resend').Resend;
} catch (e) {
  ResendClient = null;
}

// Create transporter with connection options
const getTransporter = () => {
  // PRIORITY: If RESEND_API_KEY is set, use Resend (even if Gmail settings exist)
  if (process.env.RESEND_API_KEY) {
    // Use Resend SMTP service
    console.log('📧 Transporter configured: Using Resend (RESEND_API_KEY detected)');
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true, // SSL
      auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY,
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }
  
  // Default SMTP configuration (Gmail, etc.)
  console.log('📧 Transporter configured: Using SMTP (RESEND_API_KEY not found)');
  console.log('⚠️  Make sure RESEND_API_KEY is set in your .env file if you want to use Resend');
  const port = Number(process.env.MAIL_PORT || 587);
  const isSecure = port === 465;
  
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: port,
    secure: isSecure, // true for 465, false for other ports
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
    // Connection timeout and retry settings
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 5000, // 5 seconds
    socketTimeout: 10000, // 10 seconds
    // Retry options
    pool: true,
    maxConnections: 1,
    maxMessages: 3,
    // For Gmail, use specific TLS options
    ...(process.env.MAIL_HOST === 'smtp.gmail.com' && {
      tls: {
        rejectUnauthorized: false, // Accept self-signed certificates
        ciphers: 'SSLv3'
      }
    })
  });
};

const transporter = getTransporter();

async function sendMail({ to, subject, html, text }) {
  const hasResendKey = !!process.env.RESEND_API_KEY;
  const canUseResendSdk = hasResendKey && !!ResendClient;

  // Normalize/choose FROM
  let from = (process.env.RESEND_FROM || process.env.MAIL_FROM || 'FixFinder <onboarding@resend.dev>')
    .replace(/<\s+/, '<')
    .replace(/\s+>/, '>');

  if (canUseResendSdk) {
    // Use Resend HTTP API (no SMTP, bypasses blocked ports)
    const resend = new ResendClient(process.env.RESEND_API_KEY);
    console.log('📧 Using Resend HTTP API');
    console.log('📧 Resend FROM address:', from);
    console.log('📧 Attempting to send email:', { to, from, subject, service: 'Resend-HTTP' });

    try {
      const result = await resend.emails.send({ from, to, subject, html, text });
      if (result?.error) {
        throw new Error(result.error?.message || 'Resend API error');
      }
      console.log('✅ Email sent successfully to:', to);
      return result;
    } catch (error) {
      console.error('❌ Error sending via Resend HTTP API:', error?.message || error);
      // Fall through to SMTP fallback only if SMTP is configured
      if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
        throw error;
      }
      console.warn('↩️ Falling back to SMTP transport due to Resend HTTP failure');
    }
  }

  // SMTP path (fallback or when no RESEND_API_KEY)
  if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.warn('⚠️ Email not configured - MAIL_HOST, MAIL_USER, or MAIL_PASS missing (or set RESEND_API_KEY to use Resend HTTP).');
    throw new Error('Email service is not configured. Please configure either RESEND_API_KEY (for Resend HTTP) or MAIL_HOST, MAIL_USER, and MAIL_PASS (for SMTP) in environment variables.');
  }

  // Ensure Gmail FROM matches auth user when using Gmail
  const fromMatch = from.match(/<([^>]+)>/);
  const fromEmail = fromMatch ? fromMatch[1].trim() : null;
  if (process.env.MAIL_HOST === 'smtp.gmail.com' && fromEmail !== process.env.MAIL_USER) {
    const nameMatch = from.match(/^([^<]+)/);
    const displayName = nameMatch ? nameMatch[1].trim() : 'FixFinder';
    from = `${displayName} <${process.env.MAIL_USER}>`;
    console.log('⚠️ Updated FROM address to match authenticated Gmail user');
  }

  console.log('📧 Attempting to send email via SMTP:', { to, from, subject, service: 'SMTP', host: process.env.MAIL_HOST, port: (process.env.MAIL_PORT || '587') });

  try {
    try {
      await transporter.verify();
      console.log('✅ SMTP server connection verified');
    } catch (verifyError) {
      console.warn('⚠️ SMTP verification failed, but will attempt to send anyway:', verifyError.message);
    }

    const result = await transporter.sendMail({ from, to, subject, text, html });
    console.log('✅ Email sent successfully to:', to);
    return result;
  } catch (error) {
    console.error('❌ Error sending email via SMTP:', error.message);
    console.error('Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      responseMessage: error.responseMessage
    });
    if (error.code === 'EAUTH') {
      throw new Error('Email authentication failed. Check your SMTP credentials.');
    } else if (error.code === 'ECONNECTION') {
      throw new Error('Could not connect to email server. Please check your network connection.');
    } else if (error.responseCode === 535) {
      throw new Error('Email authentication failed. For Gmail, use an App Password.');
    }
    throw error;
  }
}

// Alias for compatibility
const sendEmail = sendMail;

module.exports = { sendMail, sendEmail };




