//import { prisma } from "../../lib/prisma"
import { prisma } from "database"

export const find_market = async (asset: string) => {
    try {
        const market = await prisma.market.findFirst({
            where: {
                symbol: asset
            }
        })

        return market ? market : null;
    } catch (error) {
        return null
    }
}

export const find_asset = async (asset: string) => {
    try {
        const ast = await prisma.asset.findUnique({
            where: {
                symbol: asset
            }
        })

        return ast ? ast : null;
    } catch (error) {
        return null
    }
}

export const get_balance = async (user_id: number, asset?: string) => {
    try {
        const ast = await prisma.asset.findUnique({
            where: {
                symbol: asset || "USD"
            }
        });

        console.log({ ast });

        if (!ast) {
            return false
        }
        console.log({ user_id });

        const ast_bal = await prisma.asset_balance.findUnique({
            where: {
                user_id_assetId: {
                    assetId: ast?.id,
                    user_id: user_id
                },
                user_id: user_id
            }
        })
        console.log({ ast_bal });

        return ast_bal ? { balance: ast_bal.balance / ast.decimals, locked_balance: ast_bal.locked_balance / ast.decimals } : null;

    } catch (error) {
        console.log({ error });

        return null
    }
}