const localtunnel = require('localtunnel');
const http = require('http');

async function getPublicIp() {
  return new Promise((resolve) => {
    const req = http.get('http://api.ipify.org', (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', () => resolve(''));
  });
}

(async () => {
  try {
    const ip = await getPublicIp();
    const subdomain = 'siakad-skripsi-' + Math.floor(1000 + Math.random() * 9000);
    const tunnel = await localtunnel({ port: 3000, subdomain });

    console.log('==============================================');
    console.log('🌐 LINK PUBLIK ONLINE BERHASIL DIBUAT!');
    console.log('👉 URL WEBSITE: ' + tunnel.url);
    if (ip) {
      console.log('🔑 PASSWORD TUNNEL (IP Publik Anda): ' + ip);
    }
    console.log('==============================================');

    tunnel.on('close', () => {
      console.log('Tunnel ditutup.');
    });
  } catch (err) {
    console.error('Tunnel error:', err);
  }
})();
