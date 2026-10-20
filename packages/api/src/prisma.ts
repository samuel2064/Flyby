import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Close the Prisma connection cleanly.
 * This helper is used by the shutdown handler in server.ts to guarantee
 * the database connection is closed during graceful shutdowns (SIGTERM/
 * SIGINT) and in test teardown.
 */
export async function closePrisma(): Promise<void> {
  await prisma.$disconnect();
}
