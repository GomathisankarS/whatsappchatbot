// require('dotenv').config();
// const express = require('express');
// const axios = require('axios');
// const { google } = require('googleapis');

// const app = express();
// app.use(express.json());

// const {
//   VERIFY_TOKEN,
//   WHATSAPP_TOKEN,
//   PHONE_NUMBER_ID,
//   SHEET_ID,
//   GOOGLE_CREDENTIALS_PATH,
//   GOOGLE_CREDENTIALS_JSON, // used on Render: paste full JSON key content as one env var
//   PORT
// } = process.env;

// // ---------- Google Sheets setup ----------
// // Local dev: reads from google-credentials.json via GOOGLE_CREDENTIALS_PATH
// // Render/production: reads from GOOGLE_CREDENTIALS_JSON env var (full JSON pasted as a string)
// const authOptions = GOOGLE_CREDENTIALS_JSON
//   ? { credentials: JSON.parse(GOOGLE_CREDENTIALS_JSON) }
//   : { keyFile: GOOGLE_CREDENTIALS_PATH };

// const auth = new google.auth.GoogleAuth({
//   ...authOptions,
//   scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
// });
// const sheets = google.sheets({ version: 'v4', auth });

// async function getAnswerFromSheet(userText) {
//   try {
//     const res = await sheets.spreadsheets.values.get({
//       spreadsheetId: SHEET_ID,
//       range: 'FAQ!A2:B100', // adjust tab name if different
//     });
//     const rows = res.data.values || [];
//     const lowerText = userText.toLowerCase();

//     const match = rows.find(
//       ([keyword]) => keyword && lowerText.includes(keyword.toLowerCase())
//     );

//     return match
//       ? match[1]
//       : "Sorry, I didn't quite understand that. A team member will follow up shortly.";
//   } catch (err) {
//     console.error('Sheet read error:', err.message);
//     return "We're having a technical issue right now. Please try again shortly.";
//   }
// }

// // ---------- Send WhatsApp message ----------
// async function sendWhatsAppMessage(to, body) {
//   try {
//     await axios.post(
//       `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
//       {
//         messaging_product: 'whatsapp',
//         to,
//         type: 'text',
//         text: { body },
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${WHATSAPP_TOKEN}`,
//           'Content-Type': 'application/json',
//         },
//       }
//     );
//     console.log(`Sent reply to ${to}`);
//   } catch (err) {
//     console.error('Send message error:', err.response?.data || err.message);
//   }
// }

// // ---------- Webhook verification (GET) ----------
// app.get('/webhook', (req, res) => {
//   const mode = req.query['hub.mode'];
//   const token = req.query['hub.verify_token'];
//   const challenge = req.query['hub.challenge'];

//   if (mode === 'subscribe' && token === VERIFY_TOKEN) {
//     console.log('Webhook verified successfully');
//     return res.status(200).send(challenge);
//   }
//   res.sendStatus(403);
// });

// // ---------- Webhook receiver (POST) ----------
// app.post('/webhook', async (req, res) => {
//   res.sendStatus(200); // acknowledge immediately, Meta requires fast response

//   try {
//     const entry = req.body.entry?.[0]?.changes?.[0]?.value;
//     const message = entry?.messages?.[0];

//     if (!message) return; // could be a status update, not an actual message

//     const from = message.from; // sender's WhatsApp number
//     const text = message.text?.body;

//     if (!text) return; // skip non-text messages for now (images, audio, etc.)

//     console.log(`Incoming from ${from}: ${text}`);

//     const reply = await getAnswerFromSheet(text);
//     await sendWhatsAppMessage(from, reply);
//   } catch (err) {
//     console.error('Webhook processing error:', err.message);
//   }
// });

// // ---------- Health check ----------
// app.get('/', (req, res) => {
//   res.send('WhatsApp bot server is running.');
// });

// const port = PORT || 3000;
// app.listen(port, () => {
//   console.log(`Server listening on port ${port}`);
// });




require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

const {
  VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  SHEET_ID,
  GOOGLE_CREDENTIALS_PATH,
  GOOGLE_CREDENTIALS_JSON, // used on Render: paste full JSON key content as one env var
  PORT
} = process.env;

// ---------- Google Sheets setup ----------
const authOptions = GOOGLE_CREDENTIALS_JSON
  ? { credentials: JSON.parse(GOOGLE_CREDENTIALS_JSON) }
  : { keyFile: GOOGLE_CREDENTIALS_PATH };

const auth = new google.auth.GoogleAuth({
  ...authOptions,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function getAnswerFromSheet(lookupKey) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'FAQ!A2:B100', // Ensure tab name is FAQ
    });
    const rows = res.data.values || [];
    const normalizedKey = lookupKey.toLowerCase().trim();

    // Match either exact Button ID or keyword contained in text
    const match = rows.find(
      ([keyword]) => keyword && (keyword.toLowerCase().trim() === normalizedKey || normalizedKey.includes(keyword.toLowerCase().trim()))
    );

    return match ? match[1] : null;
  } catch (err) {
    console.error('Sheet read error:', err.message);
    return "We're having a technical issue right now. Please try again shortly.";
  }
}

// ---------- Send WhatsApp Text Message ----------
async function sendWhatsAppMessage(to, body) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`Sent text reply to ${to}`);
  } catch (err) {
    console.error('Send text message error:', err.response?.data || err.message);
  }
}

// ---------- Send WhatsApp Interactive Buttons ----------
async function sendMenuButtons(to, headerText = "Welcome! Please choose an option below:") {
  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: headerText
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'BTN_SERVICES',
                title: 'Our Services'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'BTN_PRICING',
                title: 'Pricing & Plans'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'BTN_SUPPORT',
                title: 'Talk to Support'
              }
            }
          ]
        }
      }
    };

    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`Sent button menu to ${to}`);
  } catch (err) {
    console.error('Send interactive buttons error:', err.response?.data || err.message);
  }
}

// ---------- Webhook verification (GET) ----------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ---------- Webhook receiver (POST) ----------
app.post('/webhook', async (req, res) => {
  // Acknowledge immediately to prevent Meta webhook timeout/retries
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];

    if (!message) return; // Skip non-message events (status deliveries, read receipts)

    const from = message.from; // Sender phone number

    // 1. User clicked an interactive reply button
    if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
      const buttonId = message.interactive.button_reply.id;
      const buttonTitle = message.interactive.button_reply.title;
      console.log(`Button clicked by ${from}: ${buttonTitle} (ID: ${buttonId})`);

      const answer = await getAnswerFromSheet(buttonId);
      if (answer) {
        await sendWhatsAppMessage(from, answer);
      } else {
        await sendWhatsAppMessage(from, "Here are more options:");
        await sendMenuButtons(from, "Please select an option from the menu:");
      }
      return;
    }

    // 2. User sent a standard text message
    if (message.type === 'text') {
      const incomingText = message.text?.body || '';
      console.log(`Incoming text from ${from}: ${incomingText}`);

      // Check if text directly matches any sheet keyword
      const answer = await getAnswerFromSheet(incomingText);

      if (answer) {
        await sendWhatsAppMessage(from, answer);
      } else {
        // If unrecognized or general greeting (Hi, Hello, etc.), send interactive menu buttons
        await sendMenuButtons(from, "Hi there! How can we help you today? Please choose an option below:");
      }
      return;
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
});

// ---------- Health check & Keep-alive ----------
app.get(['/', '/health'], (req, res) => {
  res.status(200).send('WhatsApp bot server is active and running.');
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});