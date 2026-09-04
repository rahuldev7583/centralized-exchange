import { BALANCES, FILLS } from "shared-types";
import { ASSETS, PRICES, SHARED_ORDERBOOK } from "./shared-state";

export const liquidation_service = async () => {
    setInterval(() => {
        console.log("liquidation");
        console.log({ SHARED_ORDERBOOK, FILLS, PRICES, BALANCES, ASSETS });

    }, 5000)

}
