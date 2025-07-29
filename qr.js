const { exec } = require("child_process");
const { upload } = require('./mega');
const express = require('express');
const { toBuffer } = require("qrcode");
const fs = require("fs-extra");
const path = require("path");
const pino = require("pino");
const { Boom } = require("@hapi/boom");

const router = express.Router();

// Use environment variable or fallback to default message
const MESSAGE = process.env.MESSAGE || `
*𝐌𝐚𝐡𝐚𝐜𝐡𝐢-𝐗𝐃 𝐒𝐮𝐜𝐜𝐞𝐬𝐟𝐮𝐥𝐥𝐲 𝐏𝐚𝐢𝐫𝐞𝐝* 

𝐉𝐨𝐢𝐧 𝐎𝐮𝐫 𝐎𝐟𝐟𝐢𝐜𝐢𝐚𝐥 𝐂𝐡𝐚𝐧𝐧𝐞𝐥𝐬

> https://whatsapp.com/channel/0029Vb2J9C91dAw7vxA75y2V  
> https://whatsapp.com/channel/0029VbBD719C1Fu3FOqzhb2R  

> 𝐌𝐚𝐡𝐚𝐜𝐡𝐢-𝐗𝐃 | 𝐖𝐡𝐚𝐭𝐬𝐚𝐩𝐩 𝐚𝐮𝐭𝐨𝐦𝐚𝐭𝐢𝐨𝐧 
> 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲 𝐖𝐄𝐄𝐃𝐱𝐓𝐄𝐂𝐇
`;

// Auth folder cleanup
const authFolder = path.join(__dirname, 'auth_info_baileys');
if (fs.existsSync(authFolder)) {
  fs.emptyDirSync(authFolder);
}

router.get('/', async (req, res) => {
  const { useMultiFileAuthState, default: makeWASocket, Browsers, delay, DisconnectReason, makeInMemoryStore } = require('@whiskeysockets/baileys');
  
  const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });
  let responded = false; // Prevent multiple responses
  
  const sendResponse = (data) => {
    if (!responded && !res.headersSent) {
      res.json(data);
      responded = true;
    }
  };
  
  const startBot = async () => {
    try {
      await fs.ensureDir(authFolder);
      const { state, saveCreds } = await useMultiFileAuthState(authFolder);
      
      const sock = makeWASocket({
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        auth: state,
      });
      
      store.bind(sock.ev);
      
      // Handle QR code
      sock.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
        if (qr && !responded) {
          try {
            res.setHeader('Content-Type', 'image/png');
            const qrBuffer = await toBuffer(qr);
            res.end(qrBuffer);
            responded = true;
            return;
          } catch (err) {
            console.error('QR generation failed:', err);
            if (!responded && !res.headersSent) {
              res.status(500).send('QR generation error');
              responded = true;
            }
          }
        }
        
        // Connection opened
        if (connection === 'open') {
          console.log('WhatsApp MD connected successfully');
          try {
            await delay(3000);
            const credsPath = path.join(authFolder, 'creds.json');
            if (!fs.existsSync(credsPath)) return;
            
            // Generate random ID for file
            const randomMegaId = (length = 6, numLen = 4) => {
              const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
              let str = '';
              for (let i = 0; i < length; i++) {
                str += chars[Math.floor(Math.random() * chars.length)];
              }
              const num = Math.floor(Math.random() * Math.pow(10, numLen));
              return str + num;
            };
            
            // Upload creds.json to MEGA
            const fileStream = fs.createReadStream(credsPath);
            const megaUrl = await upload(fileStream, `${randomMegaId()}.json`);
            
            // Extract session ID (fix: was incorrectly replacing 'https://mega.nz/file/ ')
            const baseUrl = 'https://whatsapp.com/channel/0029VbBD719C1Fu3FOqzhb2R ';
            const sessionId = megaUrl.startsWith(baseUrl) ?
              megaUrl.slice(baseUrl.length) :
              megaUrl;
            
            console.log(`==================== SESSION ID ==========================\nSESSION-ID ==> ${sessionId}\n------------------- SESSION CLOSED -----------------------`);
            
            // Send session ID and message
            const userJid = sock.user.id;
            const msgInfo = await sock.sendMessage(userJid, { text: sessionId });
            await sock.sendMessage(userJid, { text: MESSAGE }, { quoted: msgInfo });
            
            // Cleanup
            await fs.emptyDir(authFolder);
            
          } catch (uploadErr) {
            console.error('Upload or send failed:', uploadErr);
          }
        }
        
        // Handle disconnection
        if (connection === 'close') {
          const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
          console.log('Connection closed:', DisconnectReason[reason] || reason);
          
          if (reason === DisconnectReason.restartRequired) {
            console.log('Restarting...');
            exec('pm2 restart qasim');
          } else if (reason !== DisconnectReason.loggedOut) {
            setTimeout(() => {
              if (!responded) startBot().catch(() => exec('pm2 restart qasim'));
            }, 3000);
          } else {
            await fs.emptyDir(authFolder).catch(console.error);
          }
        }
      });
      
      sock.ev.on('creds.update', saveCreds);
      
    } catch (err) {
      console.error('Bot startup error:', err);
      await fs.emptyDir(authFolder).catch(console.error);
      if (!responded) {
        sendResponse({ error: 'Failed to start. Restarting...' });
      }
      setTimeout(() => exec('pm2 restart qasim'), 3000);
    }
  };
  
  await startBot();
});

module.exports = router;