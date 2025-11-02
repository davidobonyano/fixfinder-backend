const nodemailer = require("nodemailer");

// Create transporter with connection options
const getTransporter = () => {
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
  if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.warn('⚠️ Email not configured - MAIL_HOST, MAIL_USER, or MAIL_PASS missing');
    throw new Error('Email service is not configured. Please configure MAIL_HOST, MAIL_USER, and MAIL_PASS in environment variables.');
  }
  
  try {
    // Clean MAIL_FROM - remove any extra spaces and ensure it matches authenticated email
    let from = process.env.MAIL_FROM || `FixFinder <${process.env.MAIL_USER || 'no-reply@fixfinder.local'}>`;
    
    // Fix common formatting issues: "FixFinder < email@example.com>" -> "FixFinder <email@example.com>"
    from = from.replace(/<\s+/, '<').replace(/\s+>/, '>');
    
    // For Gmail, FROM email should match the authenticated MAIL_USER
    // Extract email from MAIL_FROM or use MAIL_USER
    const fromMatch = from.match(/<([^>]+)>/);
    const fromEmail = fromMatch ? fromMatch[1].trim() : process.env.MAIL_USER;
    
    // If FROM email doesn't match MAIL_USER, update it to match (Gmail requirement)
    if (process.env.MAIL_HOST === 'smtp.gmail.com' && fromEmail !== process.env.MAIL_USER) {
      const nameMatch = from.match(/^([^<]+)/);
      const displayName = nameMatch ? nameMatch[1].trim() : 'FixFinder';
      from = `${displayName} <${process.env.MAIL_USER}>`;
      console.log('⚠️ Updated FROM address to match authenticated Gmail user');
    }
    
    console.log('📧 Attempting to send email:', { 
      to, 
      from, 
      subject,
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      user: process.env.MAIL_USER
    });
    
    // Try to verify connection first (optional, but helps debug)
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




