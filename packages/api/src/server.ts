import app from "./app";
import { prisma } from "./prisma";
import { redisClient } from "./redis";

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Flyby API running on port ${PORT}`);
});

// Graceful shutdown handlers
function closeServer(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  await closeServer();

  // Close database connections
  try {
    await prisma.$disconnect();
    console.log("Prisma disconnected.");
  } catch (err) {
    console.error("Error disconnecting Prisma:", err);
  }

  // Close Redis connections
  try {
    if (redisClient) {
      await redisClient.quit();
    }
    console.log("Redis disconnected.");
  } catch (err) {
    console.error("Error disconnecting Redis:", err);
  }

  console.log("Graceful shutdown complete.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle unhandled rejections and uncaught exceptions in production
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // Give time for logs to flush, then exit
  setTimeout(() => process.exit(1), 100);
});
