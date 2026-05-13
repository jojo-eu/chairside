import { ChairsideActivityFeed } from "./ChairsideActivityFeed";
import { ChairsideDashboardKpis } from "./ChairsideDashboardKpis";

export const Dashboard = () => {
  return (
    <div className="mt-1 space-y-6">
      <ChairsideDashboardKpis />
      <ChairsideActivityFeed />
    </div>
  );
};
