import { TransferForm } from "@/components/TransferForm";
import { pageHeader, pageSubtitle, pageTitle } from "@/lib/ui";

export default function OfframpPage() {
  return (
    <div>
      <div className={pageHeader}>
        <div>
          <div className={pageTitle}>Withdraw</div>
          <div className={pageSubtitle}>Move funds out of your wallet</div>
        </div>
      </div>
      <TransferForm mode="offramp" />
    </div>
  );
}
