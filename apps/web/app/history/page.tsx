import { History } from "@/components/history/History";
import { pageHeader, pageSubtitle, pageTitle } from "@/lib/ui";

export default function HistoryPage() {
  return (
    <div>
      <div className={pageHeader}>
        <div>
          <div className={pageTitle}>History</div>
          <div className={pageSubtitle}>Balances, trades, funding, and liquidations</div>
        </div>
      </div>
      <History />
    </div>
  );
}
