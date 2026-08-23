import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    //await prisma.user.createMany({
    //    data: [
    //        { email: "alice@example.com", name: "Alice" },
    //        { email: "bob@example.com", name: "Bob" },
    //        { email: "charlie@example.com", name: "Charlie" },
    //    ],
    //    skipDuplicates: true,
    //});
    console.log("Seed complete.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });