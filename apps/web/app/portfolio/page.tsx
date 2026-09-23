import { BalancesTable, PositionsTable } from "@/components/portfolio/Portfolio";
import { pageHeader, pageSubtitle, pageTitle } from "@/lib/ui";

export default function PortfolioPage() {
  return (
    <div>
      <div className={pageHeader}>
        <div>
          <div className={pageTitle}>Portfolio</div>
          <div className={pageSubtitle}>Wallet balances and open positions</div>
        </div>
      </div>
      <BalancesTable />
      <div className="mt-2.5">
        <PositionsTable />
      </div>
    </div>
  );
}
