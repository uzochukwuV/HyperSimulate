import { 
  Play, 
  History, 
  Link, 
  BarChart3, 
  Code, 
  Search, 
  Gauge, 
  Server, 
  Settings 
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

interface SystemMetrics {
  totalSimulations: number;
  successRate: number;
  avgResponseTime: number;
  apiRequests: number;
}

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { data: metrics } = useQuery<SystemMetrics>({
    queryKey: ["/api/admin/metrics"],
    refetchInterval: 60000, // Refetch every minute
  });

  const simulationsPerMin = Math.floor(Math.random() * 50 + 120); // Mock real-time data

  const navItems = [
    { id: "transaction-builder", label: "Transaction Builder", icon: Play, section: "SIMULATION" },
    { id: "simulation-history", label: "Simulation History", icon: History, section: "SIMULATION" },
    { id: "bundle-simulator", label: "Bundle Simulator", icon: Link, section: "SIMULATION" },
    { id: "gas-profiler", label: "Gas Profiler", icon: BarChart3, section: "ANALYSIS" },
    { id: "event-decoder", label: "Event Decoder", icon: Code, section: "ANALYSIS" },
    { id: "state-inspector", label: "State Inspector", icon: Search, section: "ANALYSIS" },
    { id: "dashboard", label: "Dashboard", icon: Gauge, section: "ADMIN" },
    { id: "system-health", label: "System Health", icon: Server, section: "ADMIN" },
    { id: "configuration", label: "Configuration", icon: Settings, section: "ADMIN" },
  ];

  const sections = ["SIMULATION", "ANALYSIS", "ADMIN"];

  return (
    <aside className="w-64 bg-hyper-dark-lighter border-r border-hyper-dark-border h-screen sticky top-0" data-testid="sidebar">
      <nav className="p-4 space-y-2">
        {sections.map((section) => (
          <div key={section} className="mb-6">
            <h2 className="text-xs font-medium text-hyper-grey uppercase tracking-wider mb-3">
              {section}
            </h2>
            <div className="space-y-1">
              {navItems
                .filter((item) => item.section === section)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onViewChange(item.id)}
                      className={`nav-item ${isActive ? 'active' : ''}`}
                      data-testid={`nav-${item.id}`}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}

        <div className="mt-auto pt-6 border-t border-hyper-dark-border">
          <div className="text-xs text-hyper-grey space-y-2">
            <div className="flex justify-between">
              <span>API Status</span>
              <span className="text-hyper-green" data-testid="status-api">Online</span>
            </div>
            <div className="flex justify-between">
              <span>Simulations/min</span>
              <span className="text-hyper-teal" data-testid="text-simulations-per-min">
                {simulationsPerMin}
              </span>
            </div>
          </div>
        </div>
      </nav>
    </aside>
  );
}
