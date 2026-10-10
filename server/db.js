const { PrismaClient } = require('@prisma/client');

// Prisma Client Singleton untuk Serverless (Vercel) & Long-running Node.js
// Menghindari duplikasi connection pool saat cold-start / multiple serverless lambda instances
let prisma;

if (!global.prisma) {
  global.prisma = new PrismaClient({
    log: ['error'],
  });
}
prisma = global.prisma;

module.exports = prisma;
