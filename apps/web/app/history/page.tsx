import { History } from "@/components/history/History";

export default function HistoryPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">History</div>
          <div className="page-subtitle">Balances, trades, funding, and liquidations</div>
        </div>
      </div>
      <History />
    </div>
  );
}