const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT || 587),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

async function sendMail({ to, subject, html, text }) {
  if (!process.env.MAIL_HOST) return; // no-op if mail not configured
  const from = process.env.MAIL_FROM || "FixFinder <no-reply@fixfinder.local>";
  await transporter.sendMail({ from, to, subject, text, html });
}

// Alias for compatibility
const sendEmail = sendMail;

module.exports = { sendMail, sendEmail };




