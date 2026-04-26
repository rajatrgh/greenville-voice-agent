/**
 * Green Ville AI Voice Agent - Main Server
 * Twilio Voice + Claude API (Priya - AI Sales Agent)
 * 
 * Flow:
 * 1. Customer calls Twilio number
 * 2. Twilio hits /incoming-call → TwiML response (Priya greets)
 * 3. Customer speaks → Twilio STT → /process-speech
 * 4. Server sends to Claude → gets Priya's reply
 * 5. Twilio TTS speaks reply to customer
 * 6. Loop continues until call ends
 */

require('dotenv').config();
process.on('uncaughtException', (err) => {
  console.error('CRASH:', err.message);
});
const express = require('express');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Clients ──────────────────────────────────────────
const anthropic = new Anthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30000,
  maxRetries: 2
});
const VoiceResponse = twilio.twiml.VoiceResponse;

// ── In-memory session store (per call) ───────────────
// Key: CallSid  Value: { history: [], leadData: {} }
const sessions = new Map();

// ── Green Ville AI System Prompt ─────────────────────
const SYSTEM_PROMPT = `You are Priya, a warm and professional AI sales agent for Green Ville — a premium duplex villa township project in Raigarh, Chhattisgarh, India. You are on a LIVE PHONE CALL.

## YOUR PERSONA
- Name: Priya
- Language: Hinglish (natural mix of Hindi & English, Indian style)
- Tone: Warm, confident, helpful — like a real relationship manager
- Voice-optimized: SHORT sentences, no bullet points, no special characters

## GREEN VILLE PROJECT DETAILS
- Project: Green Ville Duplex Villas, Raigarh CG
- Price: ₹55 lakh onwards (all-inclusive)
- Type: 3BHK Duplex Villas with private garden
- Amenities: Gated community, 24x7 security, clubhouse, children's play area, wide roads, green spaces
- Possession: Ready to move / 6 months
- Bank loans: SBI, HDFC, Axis Bank (up to 80% financing)
- Contact: ${process.env.OWNER_PHONE || '9876543210'} (Rajat Sir - Sales Head)

## AGENTIC GOALS (in order)
1. GREET warmly, introduce yourself and Green Ville
2. QUALIFY: Ask name, budget, timeline, purpose (self-use or investment)
3. PITCH: Match their need to Green Ville benefits
4. HANDLE OBJECTIONS: Price, location, loan, family approval needed
5. CLOSE: Book site visit OR transfer call to Rajat Sir for hot leads

## CRITICAL VOICE RULES
- Keep EVERY response under 3 sentences — this is a phone call
- Speak naturally, no lists, no markdown, no emojis
- Ask only ONE question at a time
- If customer is HOT (says "book karna hai", "ready hoon"), say: "Bilkul! Main abhi Rajat Sir se connect karti hoon." then output: [TRANSFER]
- If customer gives their name, use it warmly in next responses
- If customer says not interested after one attempt, say goodbye warmly
- Numbers in Hindi: pachas lakh, not ₹50,00,000`;

// ── Helper: Get or create session ────────────────────
function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      history: [],
      leadData: { name: null, phone: null, budget: null, timeline: null },
      stage: 'greeting'
    });
  }
  return sessions.get(callSid);
}

// ── Helper: Call Claude ───────────────────────────────
async function askClaude(callSid, userSpeech) {
  const session = getSession(callSid);

  session.history.push({ role: 'user', content: userSpeech });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: session.history
  });

  const reply = response.content[0].text;
  session.history.push({ role: 'assistant', content: reply });

  // Extract transfer signal
  const shouldTransfer = reply.includes('[TRANSFER]');
  const cleanReply = reply.replace('[TRANSFER]', '').trim();

  return { reply: cleanReply, shouldTransfer };
}

// ── Helper: Build TwiML with AI response ─────────────
function buildTwiML(text, shouldTransfer = false, callSid) {
  const twiml = new VoiceResponse();

  if (shouldTransfer) {
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, text);
    // Transfer to owner
    const dial = twiml.dial({ timeout: 30 });
    dial.number(process.env.OWNER_PHONE);
    return twiml.toString();
  }

  twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' }, text);

  // Gather next customer speech
  const gather = twiml.gather({
    input: 'speech',
    language: 'hi-IN',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    enhanced: true,
    action: `/process-speech?callSid=${callSid}`,
    method: 'POST'
  });

  // Silence fallback
  twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' },
    'Kya aap mujhe sun pa rahe hain? Kripya kuch boliye.');
  twiml.redirect(`/process-speech?callSid=${callSid}&silent=true`);

  return twiml.toString();
}

// ══════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════

/**
 * POST /incoming-call
 * Twilio hits this when a customer calls the Twilio number.
 * Priya greets and starts listening.
 */
app.post('/incoming-call', async (req, res) => {
  const callSid = req.body.CallSid;
  const callerPhone = req.body.From;

  console.log(`\n📞 Incoming call: ${callSid} from ${callerPhone}`);

  // Save caller phone in session
  const session = getSession(callSid);
  session.leadData.phone = callerPhone;

  try {
    // Get Priya's opening greeting from Claude
    const { reply } = await askClaude(callSid,
      `[System: New call started. Caller number: ${callerPhone}. Begin the call with a warm greeting.]`
    );

    res.type('text/xml');
    res.send(buildTwiML(reply, false, callSid));

  } catch (err) {
    console.error('Claude error on greeting:', err);
    // Fallback greeting
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' },
      'Namaste! Main Priya bol rahi hoon Green Ville se. Aap kaise help kar sakti hoon?');
    const gather = twiml.gather({
      input: 'speech', language: 'hi-IN', speechTimeout: 'auto',
      action: `/process-speech?callSid=${callSid}`, method: 'POST'
    });
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * POST /process-speech
 * Called after customer speaks. Contains their transcribed speech.
 */
app.post('/process-speech', async (req, res) => {
  const callSid = req.query.callSid || req.body.CallSid;
  const speechResult = req.body.SpeechResult;
  const isSilent = req.query.silent === 'true';

  console.log(`\n🎤 [${callSid}] Customer said: "${speechResult}"`);

  // Handle silence
  if (isSilent || !speechResult) {
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' },
      'Lagta hai aawaz nahi aa rahi. Please dobara try karein. Shukriya!');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  try {
    const { reply, shouldTransfer } = await askClaude(callSid, speechResult);

    console.log(`🤖 [${callSid}] Priya says: "${reply}"`);
    if (shouldTransfer) console.log(`🔴 [${callSid}] TRANSFERRING to owner!`);

    // Log lead data update
    logLeadUpdate(callSid, speechResult);

    res.type('text/xml');
    res.send(buildTwiML(reply, shouldTransfer, callSid));

  } catch (err) {
    console.error('Claude error:', err);
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'Polly.Aditi', language: 'hi-IN' },
      'Ek second ki takniki samasya aa gayi. Kripya thodi der mein call karein.');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * POST /call-status
 * Twilio calls this when call ends. Save lead to DB/sheet.
 */
app.post('/call-status', (req, res) => {
  const callSid = req.body.CallSid;
  const status = req.body.CallStatus;
  const duration = req.body.CallDuration;

  console.log(`\n📵 Call ended: ${callSid} | Status: ${status} | Duration: ${duration}s`);

  const session = sessions.get(callSid);
  if (session) {
    console.log('📋 Lead data:', session.leadData);
    // TODO: Save to Google Sheets or database here
    // saveLead(session.leadData, session.history);
    sessions.delete(callSid); // Cleanup
  }

  res.sendStatus(200);
});

/**
 * GET /leads
 * View all active call sessions (admin/debug)
 */
app.get('/leads', (req, res) => {
  const leads = [];
  sessions.forEach((session, callSid) => {
    leads.push({ callSid, ...session.leadData, messages: session.history.length });
  });
  res.json({ activeCalls: leads.length, leads });
});

/**
 * GET /health
 * Health check for deployment platforms
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Green Ville AI Voice Agent', timestamp: new Date() });
});

// ── Helper: Extract lead info from speech ─────────────
function logLeadUpdate(callSid, speech) {
  const session = getSession(callSid);

  // Simple keyword extraction (Claude handles the real logic)
  const lowerSpeech = speech.toLowerCase();

  // Budget detection
  if (lowerSpeech.includes('lakh') || lowerSpeech.includes('budget')) {
    const match = speech.match(/(\d+)\s*lakh/i);
    if (match && !session.leadData.budget) {
      session.leadData.budget = match[1] + ' lakh';
      console.log(`💰 Budget detected: ${session.leadData.budget}`);
    }
  }
}

// ── Start Server ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Green Ville AI Voice Agent             ║
║   Server running on port ${PORT}            ║
║                                          ║
║   Endpoints:                             ║
║   POST /incoming-call  (Twilio webhook)  ║
║   POST /process-speech (Twilio gather)   ║
║   POST /call-status    (Call events)     ║
║   GET  /leads          (Active leads)    ║
║   GET  /health         (Health check)    ║
╚══════════════════════════════════════════╝
  `);
});
