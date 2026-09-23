import { TransferForm } from "@/components/TransferForm";

export default function OnrampPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Deposit</div>
          <div className="page-subtitle">Add funds to your wallet</div>
        </div>
      </div>
      <TransferForm mode="onramp" />
    </div>
  );
}