import { TransferForm } from "@/components/TransferForm";

export default function OfframpPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Withdraw</div>
          <div className="page-subtitle">Move funds out of your wallet</div>
        </div>
      </div>
      <TransferForm mode="offramp" />
    </div>
  );
}