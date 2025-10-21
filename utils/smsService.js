const twilio = require('twilio');

// Initialize Twilio client (only if credentials are provided)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Send SMS using Twilio
 * @param {string} to - Phone number (with country code)
 * @param {string} message - SMS message
 * @returns {Promise<Object>} - Twilio response
 */
async function sendSMSWithTwilio(to, message) {
  if (!twilioClient) {
    throw new Error('Twilio not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env');
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio phone number
      to: to
    });

    console.log('SMS sent via Twilio:', result.sid);
    return {
      success: true,
      messageId: result.sid,
      status: result.status
    };
  } catch (error) {
    console.error('Twilio SMS error:', error);
    throw new Error(`SMS sending failed: ${error.message}`);
  }
}

/**
 * Send SMS using Termii (Nigerian SMS provider)
 * @param {string} to - Phone number
 * @param {string} message - SMS message
 * @returns {Promise<Object>} - Termii response
 */
async function sendSMSWithTermii(to, message) {
  if (!process.env.TERMII_API_KEY) {
    throw new Error('Termii not configured. Please add TERMII_API_KEY to .env');
  }

  try {
    const response = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TERMII_API_KEY}`
      },
      body: JSON.stringify({
        to: to,
        from: process.env.TERMII_SENDER_ID || 'FixFinder',
        sms: message,
        type: 'plain',
        channel: 'generic'
      })
    });

    const result = await response.json();
    
    if (result.code === 'ok') {
      console.log('SMS sent via Termii:', result.messageId);
      return {
        success: true,
        messageId: result.messageId,
        status: 'sent'
      };
    } else {
      throw new Error(result.message || 'Termii SMS failed');
    }
  } catch (error) {
    console.error('Termii SMS error:', error);
    throw new Error(`SMS sending failed: ${error.message}`);
  }
}

/**
 * Send SMS using SendChamp (Nigerian SMS provider)
 * @param {string} to - Phone number
 * @param {string} message - SMS message
 * @returns {Promise<Object>} - SendChamp response
 */
async function sendSMSWithSendChamp(to, message) {
  if (!process.env.SENDCHAMP_API_KEY) {
    throw new Error('SendChamp not configured. Please add SENDCHAMP_API_KEY to .env');
  }

  try {
    const response = await fetch('https://api.sendchamp.com/api/v1/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SENDCHAMP_API_KEY}`
      },
      body: JSON.stringify({
        to: to,
        message: message,
        sender_name: process.env.SENDCHAMP_SENDER_NAME || 'FixFinder',
        route: 'dnd'
      })
    });

    const result = await response.json();
    
    if (result.status === 'success') {
      console.log('SMS sent via SendChamp:', result.data.message_id);
      return {
        success: true,
        messageId: result.data.message_id,
        status: 'sent'
      };
    } else {
      throw new Error(result.message || 'SendChamp SMS failed');
    }
  } catch (error) {
    console.error('SendChamp SMS error:', error);
    throw new Error(`SMS sending failed: ${error.message}`);
  }
}

/**
 * Main SMS sending function - tries providers in order of preference
 * @param {string} to - Phone number
 * @param {string} message - SMS message
 * @returns {Promise<Object>} - SMS response
 */
async function sendSMS(to, message) {
  // Format phone number for Nigerian numbers
  let formattedNumber = to;
  if (to.startsWith('0')) {
    formattedNumber = '+234' + to.substring(1);
  } else if (!to.startsWith('+')) {
    formattedNumber = '+234' + to;
  }

  console.log(`Sending SMS to ${formattedNumber}: ${message}`);

  // Try providers in order of preference
  const providers = [
    { name: 'Twilio', fn: sendSMSWithTwilio },
    { name: 'Termii', fn: sendSMSWithTermii },
    { name: 'SendChamp', fn: sendSMSWithSendChamp }
  ];

  for (const provider of providers) {
    try {
      const result = await provider.fn(formattedNumber, message);
      console.log(`SMS sent successfully via ${provider.name}`);
      return result;
    } catch (error) {
      console.warn(`${provider.name} failed:`, error.message);
      // Continue to next provider
    }
  }

  // If all providers fail, log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n=== SMS NOT SENT (No providers configured) ===`);
    console.log(`To: ${formattedNumber}`);
    console.log(`Message: ${message}`);
    console.log(`\nTo enable SMS, configure one of these providers:`);
    console.log(`1. Twilio: Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER`);
    console.log(`2. Termii: Add TERMII_API_KEY, TERMII_SENDER_ID`);
    console.log(`3. SendChamp: Add SENDCHAMP_API_KEY, SENDCHAMP_SENDER_NAME`);
    console.log(`===============================================\n`);
    
    return {
      success: true,
      messageId: 'dev-' + Date.now(),
      status: 'logged',
      note: 'SMS logged to console (no provider configured)'
    };
  }

  throw new Error('All SMS providers failed');
}

module.exports = {
  sendSMS,
  sendSMSWithTwilio,
  sendSMSWithTermii,
  sendSMSWithSendChamp
};




