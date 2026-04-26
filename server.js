require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30000,
  maxRetries: 2
});

const VoiceResponse = twilio.twiml.VoiceResponse;
const sessions = new Map();

const SYSTEM_PROMPT = `You are Priya, a warm and professional AI sales agent for Green Ville — a premium duplex villa township project in Raigarh, Chhattisgarh, India. You are on a LIVE PHONE CALL.

PERSONA: Name is Priya. Speak in Hinglish (Hindi + English mix). Warm and confident tone.

GREEN VILLE DETAILS:
- Project: Green Ville Duplex Villas, Raigarh CG
- Price: 55 lakh onwards
- Type: 3BHK Duplex Villas with private garden
- Amenities: Gated community, 24x7 security, clubhouse, children play area
- Possession: Ready to move or 6 months
- Loans: SBI, HDFC, Axis Bank up to 80 percent

GOALS:
1. Greet warmly
2. Ask name, budget, timeline
3. Pitch Green Ville benefits
4. Handle objections
5. Book site visit or transfer hot leads

RULES:
- Keep every response under 3 sentences
- Ask only one question at a time
- If customer says "book karna hai" or "ready hoon", say goodbye warmly and output [TRANSFER]
- No markdown, no lists, just natural speech`;

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, { history: [], leadData: {} });
  }
  return sessions.get(callSid);
}

async function askClaude(callSid, userMessage) {
  const session = getSession(callSid);
  session.history.push({ role: 'user', content: userMessage });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: session.history
  });

  const reply = response.content[0].text;
  session.history.push({ role: 'assistant', content: reply });

  const shouldTransfer = reply.includes('[TRANSFER]');
  const cleanReply = reply.replace('[TRANSFER]', '').trim();

  return { reply: cleanReply, shouldTransfer };
}

function buildTwiML(text, shouldTransfer, callSid) {
  const twiml = new VoiceResponse();

  if (shouldTransfer) {
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, text);
    const dial = twiml.dial({ timeout: 30 });
    dial.number(process.env.OWNER_PHONE);
    return twiml.toString();
  }

  twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, text);

  twiml.gather({
    input: 'speech',
    language: 'hi-IN',
    speechTimeout: 'auto',
    action: '/process-speech?callSid=' + callSid,
    method: 'POST'
  });

  twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'Kya aap mujhe sun pa rahe hain?');

  return twiml.toString();
}

app.post('/incoming-call', async (req, res) => {
  const callSid = req.body.CallSid;
  const callerPhone = req.body.From;

  console.log('Incoming call:', callSid, 'from', callerPhone);

  try {
    const { reply } = await askClaude(callSid, 'New call started. Greet the customer warmly in Hinglish.');
    console.log('Priya says:', reply);
    res.type('text/xml');
    res.send(buildTwiML(reply, false, callSid));
  } catch (err) {
    console.error('Error:', err.message);
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' },
      'Namaste! Main Priya bol rahi hoon Green Ville se. Aap kaise help kar sakti hoon?');
    twiml.gather({
      input: 'speech',
      language: 'hi-IN',
      speechTimeout: 'auto',
      action: '/process-speech?callSid=' + callSid,
      method: 'POST'
    });
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

app.post('/process-speech', async (req, res) => {
  const callSid = req.query.callSid || req.body.CallSid;
  const speechResult = req.body.SpeechResult;

  console.log('Customer said:', speechResult);

  if (!speechResult) {
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'Maafi chahti hoon, kuch suna nahi. Shukriya!');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  try {
    const { reply, shouldTransfer } = await askClaude(callSid, speechResult);
    console.log('Priya says:', reply);
    res.type('text/xml');
    res.send(buildTwiML(reply, shouldTransfer, callSid));
  } catch (err) {
    console.error('Error:', err.message);
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, 'Ek minute ki takniki samasya. Dobara call karein. Shukriya!');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

app.post('/call-status', (req, res) => {
  const callSid = req.body.CallSid;
  const status = req.body.CallStatus;
  console.log('Call ended:', callSid, 'Status:', status);
  sessions.delete(callSid);
  res.sendStatus(200);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Green Ville AI Voice Agent', timestamp: new Date() });
});

app.get('/leads', (req, res) => {
  const leads = [];
  sessions.forEach((session, callSid) => {
    leads.push({ callSid, messages: session.history.length });
  });
  res.json({ activeCalls: leads.length, leads });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Green Ville AI Voice Agent running on port', PORT);
});

