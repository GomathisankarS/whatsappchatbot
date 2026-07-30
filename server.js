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
// Local dev: reads from google-credentials.json via GOOGLE_CREDENTIALS_PATH
// Render/production: reads from GOOGLE_CREDENTIALS_JSON env var (full JSON pasted as a string)
const authOptions = GOOGLE_CREDENTIALS_JSON
  ? { credentials: JSON.parse(GOOGLE_CREDENTIALS_JSON) }
  : { keyFile: GOOGLE_CREDENTIALS_PATH };

const auth = new google.auth.GoogleAuth({
  ...authOptions,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function getAnswerFromSheet(userText) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'FAQ!A2:B100', // adjust tab name if different
    });
    const rows = res.data.values || [];
    const lowerText = userText.toLowerCase();

    const match = rows.find(
      ([keyword]) => keyword && lowerText.includes(keyword.toLowerCase())
    );

    return match
      ? match[1]
      : "Sorry, I didn't quite understand that. A team member will follow up shortly.";
  } catch (err) {
    console.error('Sheet read error:', err.message);
    return "We're having a technical issue right now. Please try again shortly.";
  }
}

// ---------- Send WhatsApp message ----------
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
    console.log(`Sent reply to ${to}`);
  } catch (err) {
    console.error('Send message error:', err.response?.data || err.message);
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
  res.sendStatus(200); // acknowledge immediately, Meta requires fast response

  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = entry?.messages?.[0];

    if (!message) return; // could be a status update, not an actual message

    const from = message.from; // sender's WhatsApp number
    const text = message.text?.body;

    if (!text) return; // skip non-text messages for now (images, audio, etc.)

    console.log(`Incoming from ${from}: ${text}`);

    const reply = await getAnswerFromSheet(text);
    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }
});

// ---------- Health check ----------
app.get('/', (req, res) => {
  res.send('WhatsApp bot server is running.');
});

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
