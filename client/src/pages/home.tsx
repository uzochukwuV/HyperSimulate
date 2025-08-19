import { useState } from "react";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import TransactionBuilder from "@/components/simulation/transaction-builder";
import TransactionReplay from "@/components/simulation/transaction-replay";
import SimulationResults from "@/components/simulation/simulation-results";
import AdminDashboard from "@/components/admin/dashboard";
import ApiEndpoints from "@/components/admin/api-endpoints";

type ActiveView = "transaction-builder" | "transaction-replay" | "simulation-history" | "bundle-simulator" | "gas-profiler" | "event-decoder" | "state-inspector" | "dashboard" | "system-health" | "configuration";

export default function Home() {
  const [activeView, setActiveView] = useState<ActiveView>("transaction-builder");
  const [lastSimulationResult, setLastSimulationResult] = useState(null);

  const renderMainContent = () => {
    switch (activeView) {
      case "transaction-builder":
        return (
          <div className="space-y-8">
            <TransactionBuilder onSimulationComplete={setLastSimulationResult} />
            {lastSimulationResult && <SimulationResults result={lastSimulationResult} />}
          </div>
        );
      case "transaction-replay":
        return (
          <div className="space-y-8">
            <TransactionReplay onReplayComplete={setLastSimulationResult} />
            {lastSimulationResult && <SimulationResults result={lastSimulationResult} />}
          </div>
        );
      case "dashboard":
        return <AdminDashboard />;
      case "system-health":
        return <ApiEndpoints />;
      default:
        return (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-hyper-grey mb-4">Coming Soon</h2>
              <p className="text-hyper-grey">This feature is currently under development.</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-hyper-dark">
      <Header />
      <div className="flex">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 p-6">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}
