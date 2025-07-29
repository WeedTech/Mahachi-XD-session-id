const mega = require('megajs');

const auth = {
  email: 'jadenafrix10@gmail.com',
  password: 'Mahachi2007.',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const upload = (data, name) => {
  return new Promise((resolve, reject) => {
    if (!auth.email || !auth.password) {
      return reject(new Error('MEGA email or password is missing'));
    }
    
    let storage;
    try {
      storage = new mega.Storage(auth);
      
      storage.on('ready', () => {
        const upload = storage.upload({ name, allowUploadBuffering: true });
        data.pipe(upload);
      });
      
      storage.on('error', (err) => {
        reject(new Error(`Storage error: ${err.message}`));
      });
      
      storage.on('add', (file) => {
        file.link((err, url) => {
          storage.close();
          if (err) return reject(new Error(`Failed to generate link: ${err.message}`));
          resolve(url);
        });
      });
    } catch (err) {
      reject(new Error(`Upload failed: ${err.message}`));
    }
  });
};

module.exports = { upload };