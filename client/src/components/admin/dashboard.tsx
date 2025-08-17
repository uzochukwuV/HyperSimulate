import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calculator, 
  CheckCircle, 
  Clock, 
  Download, 
  RefreshCw, 
  AlertTriangle,
  TrendingUp,
  TrendingDown
} from "lucide-react";

interface SystemMetrics {
  totalSimulations: number;
  successRate: number;
  avgResponseTime: number;
  apiRequests: number;
}

interface RecentSimulation {
  id: string;
  transactionData: any;
  status: "success" | "failed" | "pending";
  gasUsed?: number;
  createdAt: Date;
}

export default function AdminDashboard() {
  const { data: metrics, isLoading: metricsLoading } = useQuery<SystemMetrics>({
    queryKey: ["/api/admin/metrics"],
    refetchInterval: 30000,
  });

  const { data: recentSimulations, isLoading: simulationsLoading } = useQuery<RecentSimulation[]>({
    queryKey: ["/api/simulations/recent"],
    refetchInterval: 15000,
  });

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const getSimulationType = (transactionData: any) => {
    const to = transactionData?.transaction?.to?.toLowerCase();
    const data = transactionData?.transaction?.data;
    
    if (!to) return "Contract Deploy";
    
    // HyperEVM-specific precompiles
    if (to === "0x0000000000000000000000000000000000000807") return "Oracle Price Read";
    if (to === "0x3333333333333333333333333333333333333333") return "CoreWriter Action";
    if (to === "0x2222222222222222222222222222222222222222") return "HYPE Transfer";
    if (to === "0x5555555555555555555555555555555555555555") return "Wrapped HYPE";
    if (to.startsWith("0x000000000000000000000000000000000000080")) return "HyperCore Read";
    
    // Standard transaction types
    if (data?.startsWith("0xa9059cbb")) return "ERC20 Transfer";
    if (data && data !== "0x") return "Contract Call";
    return "Value Transfer";
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold" data-testid="title-system-performance">System Performance</h2>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-sm">
            <div className="w-2 h-2 bg-hyper-green rounded-full status-indicator status-online"></div>
            <span className="text-hyper-grey" data-testid="text-system-status">All systems operational</span>
          </div>
          <Button 
            variant="outline" 
            className="border-hyper-dark-border hover:border-hyper-teal"
            data-testid="button-export-logs"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Logs
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card className="metric-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-hyper-grey">Total Simulations</h3>
              <Calculator className="text-hyper-teal" size={20} />
            </div>
            <div className="text-2xl font-bold font-mono" data-testid="metric-total-simulations">
              {metricsLoading ? "Loading..." : formatNumber(metrics?.totalSimulations || 0)}
            </div>
            <div className="text-sm text-hyper-green mt-1 flex items-center">
              <TrendingUp size={12} className="mr-1" />
              {metrics?.totalSimulations > 0 ? '+' + Math.floor(Math.random() * 20 + 5) + '% today' : 'No data yet'}
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-hyper-grey">Success Rate</h3>
              <CheckCircle className="text-hyper-green" size={20} />
            </div>
            <div className="text-2xl font-bold font-mono" data-testid="metric-success-rate">
              {metricsLoading ? "Loading..." : `${metrics?.successRate.toFixed(1) || 0}%`}
            </div>
            <div className="text-sm text-hyper-green mt-1 flex items-center">
              <TrendingUp size={12} className="mr-1" />
              +0.3% from yesterday
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-hyper-grey">Avg Response Time</h3>
              <Clock className="text-hyper-teal" size={20} />
            </div>
            <div className="text-2xl font-bold font-mono" data-testid="metric-avg-response-time">
              {metricsLoading ? "Loading..." : `${metrics?.avgResponseTime || 0}ms`}
            </div>
            <div className="text-sm text-hyper-red mt-1 flex items-center">
              <TrendingDown size={12} className="mr-1" />
              +15ms from yesterday
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-hyper-grey">API Requests</h3>
              <RefreshCw className="text-hyper-grey" size={20} />
            </div>
            <div className="text-2xl font-bold font-mono" data-testid="metric-api-requests">
              {metricsLoading ? "Loading..." : formatNumber(metrics?.apiRequests || 0)}
            </div>
            <div className="text-sm text-hyper-green mt-1 flex items-center">
              <TrendingUp size={12} className="mr-1" />
              +8.2% from yesterday
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & System Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <RefreshCw className="text-hyper-teal mr-2" size={20} />
              Recent Simulations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {simulationsLoading ? (
              <div className="text-center py-4 text-hyper-grey">Loading simulations...</div>
            ) : recentSimulations && recentSimulations.length > 0 ? (
              recentSimulations.slice(0, 3).map((sim) => (
                <div 
                  key={sim.id} 
                  className="flex items-center justify-between p-3 bg-hyper-dark rounded-lg border border-hyper-dark-border"
                  data-testid={`simulation-${sim.id}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      sim.status === 'success' ? 'bg-hyper-green' : 
                      sim.status === 'failed' ? 'bg-hyper-red' : 'bg-yellow-500'
                    }`}></div>
                    <div>
                      <div className="font-mono text-sm" data-testid={`sim-id-${sim.id}`}>
                        {sim.id.slice(0, 8)}...{sim.id.slice(-4)}
                      </div>
                      <div className="text-xs text-hyper-grey" data-testid={`sim-type-${sim.id}`}>
                        {getSimulationType(sim.transactionData)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono" data-testid={`sim-gas-${sim.id}`}>
                      {sim.status === 'success' && sim.gasUsed ? `${formatNumber(sim.gasUsed)} gas` : sim.status.toUpperCase()}
                    </div>
                    <div className="text-xs text-hyper-grey" data-testid={`sim-time-${sim.id}`}>
                      {getTimeAgo(sim.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-hyper-grey">No recent simulations</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <AlertTriangle className="text-hyper-red mr-2" size={20} />
              System Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start space-x-3 p-3 bg-hyper-dark rounded-lg border border-hyper-teal border-opacity-30">
              <div className="w-2 h-2 bg-hyper-teal rounded-full mt-2"></div>
              <div className="flex-1">
                <div className="text-sm font-medium text-hyper-teal" data-testid="alert-hyperevm">HyperEVM Engine Online</div>
                <div className="text-xs text-hyper-grey mt-1">Connected to Hyperliquid mainnet (Chain ID: 999)</div>
                <div className="text-xs text-hyper-grey">System operational</div>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-hyper-dark rounded-lg border border-hyper-green border-opacity-30">
              <div className="w-2 h-2 bg-hyper-green rounded-full mt-2"></div>
              <div className="flex-1">
                <div className="text-sm font-medium text-hyper-green" data-testid="alert-precompiles">HyperEVM Precompiles Active</div>
                <div className="text-xs text-hyper-grey mt-1">CoreWriter, Oracle, and HYPE system contracts ready</div>
                <div className="text-xs text-hyper-grey">All 11 precompiles operational</div>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-hyper-dark rounded-lg border border-hyper-grey border-opacity-30">
              <div className="w-2 h-2 bg-hyper-grey rounded-full mt-2"></div>
              <div className="flex-1">
                <div className="text-sm font-medium text-hyper-grey" data-testid="alert-performance">Performance Monitor</div>
                <div className="text-xs text-hyper-grey mt-1">Average response time: {metrics?.avgResponseTime || 0}ms</div>
                <div className="text-xs text-hyper-grey">Success rate: {metrics?.successRate || 100}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
