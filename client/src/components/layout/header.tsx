import { useQuery } from "@tanstack/react-query";
import { Box, User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NetworkState {
  blockNumber: string;
  gasPrice: string;
  bigBlockGasPrice: string;
  chainId: string;
}

export default function Header() {
  const { data: networkState } = useQuery<NetworkState>({
    queryKey: ["/api/network/state"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const formatBlockNumber = (blockNumber: string) => {
    if (!blockNumber) return "Loading...";
    const num = parseInt(blockNumber, 16);
    return num.toLocaleString();
  };

  const formatGasPrice = (gasPrice: string) => {
    if (!gasPrice) return "Loading...";
    const gwei = parseInt(gasPrice, 16) / 1e9;
    return `${gwei.toFixed(2)} Gwei`;
  };

  return (
    <header className="bg-hyper-dark-lighter border-b border-hyper-dark-border px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-hyper-teal rounded-lg flex items-center justify-center">
              <Box className="text-hyper-dark text-sm" size={16} />
            </div>
            <h1 className="text-xl font-bold font-mono" data-testid="title">HyperEVM Simulator</h1>
          </div>
          <div className="hidden md:flex items-center space-x-1 text-sm text-hyper-grey font-mono">
            <span>Connected to</span>
            <span className="text-hyper-teal">Mainnet</span>
            <div className="w-2 h-2 bg-hyper-green rounded-full ml-2 status-indicator status-online"></div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-4 text-sm font-mono">
            <div className="flex items-center space-x-2">
              <span className="text-hyper-grey">Block:</span>
              <span className="text-hyper-teal" data-testid="current-block">
                {formatBlockNumber(networkState?.blockNumber || "0x0")}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-hyper-grey">Gas Price:</span>
              <span className="text-hyper-green" data-testid="gas-price">
                {formatGasPrice(networkState?.gasPrice || "0x0")}
              </span>
            </div>
          </div>
          <Button 
            className="bg-hyper-teal text-hyper-dark hover:bg-hyper-teal/90 font-medium"
            data-testid="button-admin"
          >
            <User className="w-4 h-4 mr-2" />
            Admin
          </Button>
        </div>
      </div>
    </header>
  );
}
