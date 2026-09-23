import { BalancesTable, PositionsTable } from "@/components/portfolio/Portfolio";

export default function PortfolioPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Portfolio</div>
          <div className="page-subtitle">Wallet balances and open positions</div>
        </div>
      </div>
      <BalancesTable />
      <div style={{ marginTop: 10 }}>
        <PositionsTable />
      </div>
    </div>
  );
}