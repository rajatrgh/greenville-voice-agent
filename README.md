# Green Ville AI Voice Agent 🏡📞

Twilio + Claude API se bana hua AI Sales Voice Agent.
Customer call karta hai → Priya (AI) baat karti hai → Lead capture → Hot lead transfer.

---

## Folder Structure

```
greenville-voice-server/
├── server.js        ← Main server (edit karo agar changes chahiye)
├── package.json     ← Dependencies
├── .env.example     ← Environment template
├── .env             ← YOUR SECRETS (git mein mat daalna!)
└── README.md        ← Yeh file
```

---

## STEP 1: Prerequisites Install Karo

Node.js 18+ chahiye. Check karo:
```bash
node --version
```

Agar nahi hai: https://nodejs.org se download karo.

---

## STEP 2: Project Setup

```bash
# Folder mein jao
cd greenville-voice-server

# Dependencies install karo
npm install

# .env file banao
cp .env.example .env
```

---

## STEP 3: API Keys Lao

### A) Anthropic API Key
1. https://console.anthropic.com pe jao
2. "API Keys" → "Create Key"
3. Copy karo → .env mein `ANTHROPIC_API_KEY=` ke aage paste karo

### B) Twilio Account
1. https://twilio.com pe free account banao
2. Console pe jao → Dashboard
3. `Account SID` aur `Auth Token` copy karo → .env mein daalo
4. **Phone Number kharido:**
   - Twilio Console → Phone Numbers → Buy a Number
   - Country: India
   - Capabilities: Voice ✓
   - ~$1/month
5. Number copy karo → .env mein `TWILIO_PHONE_NUMBER` mein daalo

### C) Owner Phone
- `OWNER_PHONE` mein apna number daalo (hot lead transfer ke liye)
- Format: +919876543210 (country code ke saath)

---

## STEP 4: Local Test Karo

```bash
# Server start karo
npm start

# Alag terminal mein - internet se expose karo (testing ke liye)
npx ngrok http 3000
```

ngrok ek URL dega jaise: `https://abc123.ngrok.io`

---

## STEP 5: Twilio Webhook Set Karo

1. Twilio Console → Phone Numbers → Manage → Active Numbers
2. Apna number click karo
3. **Voice Configuration** section mein:
   - "A Call Comes In" → Webhook → `POST`
   - URL: `https://abc123.ngrok.io/incoming-call`
4. **Call Status Changes** mein:
   - URL: `https://abc123.ngrok.io/call-status`
5. Save karo

---

## STEP 6: TEST! 📞

Twilio number pe call karo.
Priya answer karegi Hinglish mein!

---

## STEP 7: Production Deploy (Railway.app - Free)

1. https://railway.app pe GitHub se login karo
2. "New Project" → "Deploy from GitHub repo"
3. Is folder ko GitHub pe push karo
4. Railway mein Environment Variables daalo (.env ki sari values)
5. Railway ek URL dega jaise: `https://greenville-agent.railway.app`
6. Twilio webhook URL update karo (ngrok ki jagah Railway URL)

```bash
# GitHub pe push karne ke liye
git init
git add .
git commit -m "Green Ville Voice Agent"
git remote add origin https://github.com/YOURNAME/greenville-voice-agent.git
git push -u origin main
```

---

## HOW IT WORKS

```
Customer calls +91-XXXXXXXXXX (Twilio number)
        ↓
Twilio hits POST /incoming-call
        ↓
Server asks Claude: "New call started, greet the customer"
        ↓
Claude returns Priya's greeting text
        ↓
Twilio converts text → voice (Amazon Polly Aditi - Hindi voice)
        ↓
Customer speaks
        ↓
Twilio converts speech → text (STT)
        ↓
Server hits POST /process-speech with customer's words
        ↓
Claude responds as Priya (with full conversation history)
        ↓
Loop continues...
        ↓
If Claude returns [TRANSFER] → Twilio dials OWNER_PHONE
        ↓
Call ends → POST /call-status → Lead data logged
```

---

## CUSTOMIZATION

### Priya ki awaaz badlni hai?
`server.js` mein `voice: 'Polly.Aditi'` change karo:
- `Polly.Aditi` — Hindi female (default, best for Hinglish)
- `Polly.Raveena` — Hindi female (alternate)

### Naya project detail add karna hai?
`server.js` mein `SYSTEM_PROMPT` ke andar `## GREEN VILLE PROJECT DETAILS` section update karo.

### Leads Google Sheet mein save karne hain?
`/call-status` route mein `// TODO: Save to Google Sheets` comment hai.
Wahan Google Sheets API call add karo. (Batao toh code deta hoon!)

---

## COSTS (Monthly Estimate)

| Item | Cost |
|------|------|
| Twilio Indian number | ~$1 (₹85) |
| Twilio per minute | ~$0.013 (₹1.1) |
| Claude API per call | ~₹1-2 |
| Railway hosting | Free tier |
| **50 calls × 3 min avg** | **~₹300-400/month** |

---

## TROUBLESHOOTING

**"Cannot POST /incoming-call"** → Server nahi chal raha. `npm start` karo.

**Priya kuch nahi bolti** → Claude API key check karo in .env

**Call connect hoti hai but hang ho jaati** → ngrok/Railway URL Twilio mein sahi set hai?

**Hindi mein samajh nahi aa rahi** → Twilio `language: 'hi-IN'` already set hai. Customer clearly bole.

**Transfer nahi ho raha** → `OWNER_PHONE` format check karo: must be `+91XXXXXXXXXX`
