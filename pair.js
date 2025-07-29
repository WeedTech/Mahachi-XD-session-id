const express = require('express');
const fs = require('fs-extra');
const { exec } = require('child_process');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const MESSAGE = process.env.MESSAGE || `*𝐌𝐚𝐡𝐚𝐜𝐡𝐢-𝐗𝐃 𝐒𝐮𝐜𝐜𝐞𝐬𝐟𝐮𝐥𝐥𝐲 𝐏𝐚𝐢𝐫𝐞𝐝* 

𝐉𝐨𝐢𝐧 𝐎𝐮𝐫 𝐎𝐟𝐟𝐢𝐜𝐢𝐚𝐥 𝐂𝐡𝐚𝐧𝐧𝐞𝐥𝐬

> https://whatsapp.com/channel/0029Vb2J9C91dAw7vxA75y2V 

> https://whatsapp.com/channel/0029VbBD719C1Fu3FOqzhb2R 

> 𝐌𝐚𝐡𝐚𝐜𝐡𝐢-𝐗𝐃 | 𝐖𝐡𝐚𝐭𝐬𝐚𝐩𝐩 𝐚𝐮𝐭𝐨𝐦𝐚𝐭𝐢𝐨𝐧 
> 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲 𝐖𝐄𝐄𝐃𝐱𝐓𝐄𝐂𝐇`;

const { upload } = require('./mega');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const router = express.Router();

// Clear auth folder on load
const authFolder = './auth_info_baileys';
if (fs.existsSync(authFolder)) {
  fs.emptyDirSync(authFolder);
}

router.get('/', async (req, res) => {
  const num = req.query.number?.toString().replace(/[^0-9]/g, '');
  if (!num) return res.status(400).json({ error: 'Valid number is required' });
  
  // Prevent multiple responses
  let responded = false;
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
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Safari'),
      });
      
      // On successful connection
      sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'open') {
          console.log('Successfully connected to WhatsApp MD');
          
          try {
            await delay(3000);
            
            const credsPath = `${authFolder}/creds.json`;
            if (!fs.existsSync(credsPath)) {
              console.error('Auth file not found after connection');
              return;
            }
            
            // Generate random ID for file
            const randomMegaId = (length = 6, numberLength = 4) => {
              const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
              let result = '';
              for (let i = 0; i < length; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
              }
              const number = Math.floor(Math.random() * Math.pow(10, numberLength));
              return `${result}${number}`;
            };
            
            // Upload to MEGA
            const fileStream = fs.createReadStream(credsPath);
            const megaUrl = await upload(fileStream, `${randomMegaId()}.json`);
            
            // Extract session ID (remove base channel if present)
            const baseUrl = 'https://whatsapp.com/channel/0029VbBD719C1Fu3FOqzhb2R ';
            const sessionId = megaUrl.startsWith(baseUrl) ?
              megaUrl.slice(baseUrl.length) :
              megaUrl;
            
            // Send messages
            const userJid = sock.user.id;
            const msgInfo = await sock.sendMessage(userJid, { text: sessionId });
            await sock.sendMessage(userJid, {
              image: { url: 'https://files.catbox.moe/qyph7m.jpg' },
              caption: MESSAGE
            }, { quoted: msgInfo });
            
            // Cleanup
            await fs.emptyDir(authFolder);
            
          } catch (uploadError) {
            console.error('Upload or send error:', uploadError);
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
            await fs.emptyDir(authFolder);
          }
        }
      });
      
      // Auth state update
      sock.ev.on('creds.update', saveCreds);
      
      // Wait for pairing
      if (!state.creds.registered) {
        await delay(1500);
        const pairingCode = await sock.requestPairingCode(num);
        sendResponse({ code: pairingCode });
      }
      
    } catch (err) {
      console.error('Bot initialization error:', err);
      await fs.emptyDir(authFolder).catch(console.error);
      
      if (!responded) {
        sendResponse({ code: 'Error: Try again in a few minutes.' });
      }
      
      // Restart service
      setTimeout(() => exec('pm2 restart qasim'), 3000);
    }
  };
  
  // Start bot
  await startBot();
});

module.exports = router;