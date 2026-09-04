import { liquidation_service } from "./liquidation";
import { risk_check_service } from "./risk-check"
import { shared_service } from "./shared-state";

const main = async () => {
    shared_service();
    risk_check_service();
    liquidation_service()
    console.log("All sevices up");
}

main().catch(err => {
    console.log("startup failed");
    console.log({ err });
})