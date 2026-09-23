import { TransferForm } from "@/components/TransferForm";
import { pageHeader, pageSubtitle, pageTitle } from "@/lib/ui";

export default function OnrampPage() {
  return (
    <div>
      <div className={pageHeader}>
        <div>
          <div className={pageTitle}>Deposit</div>
          <div className={pageSubtitle}>Add funds to your wallet</div>
        </div>
      </div>
      <TransferForm mode="onramp" />
    </div>
  );
}
