const nodemailer = require("nodemailer");

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
  // Check if Resend is configured
  const isResend = process.env.RESEND_API_KEY;
  
  if (isResend) {
    // Resend configuration - only need API key
    console.log('📧 Using Resend email service');
  } else {
    // Traditional SMTP - need all credentials
    if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
      console.warn('⚠️ Email not configured - MAIL_HOST, MAIL_USER, or MAIL_PASS missing (or use RESEND_API_KEY for Resend)');
      throw new Error('Email service is not configured. Please configure either RESEND_API_KEY (for Resend) or MAIL_HOST, MAIL_USER, and MAIL_PASS (for SMTP) in environment variables.');
    }
  }
  
  try {
    // Clean MAIL_FROM - remove any extra spaces
    let from = process.env.MAIL_FROM || 'FixFinder <onboarding@resend.dev>';
    
    // Fix common formatting issues: "FixFinder < email@example.com>" -> "FixFinder <email@example.com>"
    from = from.replace(/<\s+/, '<').replace(/\s+>/, '>');
    
    // Extract email from MAIL_FROM
    const fromMatch = from.match(/<([^>]+)>/);
    const fromEmail = fromMatch ? fromMatch[1].trim() : null;
    
    // For Resend: FROM email must be verified in Resend dashboard
    // For Gmail: FROM email should match authenticated MAIL_USER
    if (process.env.RESEND_API_KEY) {
      // Resend: Use RESEND_FROM if set (priority), otherwise MAIL_FROM, otherwise default
      from = process.env.RESEND_FROM || process.env.MAIL_FROM || 'FixFinder <onboarding@resend.dev>';
      // Clean up formatting
      from = from.replace(/<\s+/, '<').replace(/\s+>/, '>');
      console.log('📧 Resend FROM address:', from);
    } else if (process.env.MAIL_HOST === 'smtp.gmail.com') {
      // For Gmail, FROM email should match authenticated MAIL_USER
      if (fromEmail !== process.env.MAIL_USER) {
        const nameMatch = from.match(/^([^<]+)/);
        const displayName = nameMatch ? nameMatch[1].trim() : 'FixFinder';
        from = `${displayName} <${process.env.MAIL_USER}>`;
        console.log('⚠️ Updated FROM address to match authenticated Gmail user');
      }
    }
    
    // Determine which service is actually being used
    const isUsingResend = !!process.env.RESEND_API_KEY;
    
    console.log('📧 Attempting to send email:', { 
      to, 
      from, 
      subject,
      service: isUsingResend ? 'Resend' : 'SMTP',
      host: isUsingResend ? 'smtp.resend.com' : process.env.MAIL_HOST,
      port: isUsingResend ? '465' : (process.env.MAIL_PORT || '587')
    });
    
    // Try to verify connection first (optional, but helps debug)
    try {
      await transporter.verify();
      console.log(`✅ ${isUsingResend ? 'Resend' : 'SMTP'} server connection verified`);
    } catch (verifyError) {
      console.warn(`⚠️ ${isUsingResend ? 'Resend' : 'SMTP'} verification failed, but will attempt to send anyway:`, verifyError.message);
    }
    
    const result = await transporter.sendMail({ from, to, subject, text, html });
    console.log('✅ Email sent successfully to:', to);
    return result;
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.error('Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      responseMessage: error.responseMessage
    });
    
    // More helpful error messages
    if (error.code === 'EAUTH') {
      throw new Error('Email authentication failed. Please check your Gmail App Password is correct.');
    } else if (error.code === 'ECONNECTION') {
      throw new Error('Could not connect to email server. Please check your network connection.');
    } else if (error.responseCode === 535) {
      throw new Error('Email authentication failed. Make sure you\'re using a Gmail App Password, not your regular password.');
    }
    
    throw error;
  }
}

// Alias for compatibility
const sendEmail = sendMail;

module.exports = { sendMail, sendEmail };




