import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error(
        "DATABASE_URL is not set",
    );
}

const adapter = new PrismaPg({
    connectionString: DATABASE_URL,
});


const globalForPrisma = globalThis as typeof globalThis & {
    prisma?: PrismaClient;
};

export const prisma: PrismaClient =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}