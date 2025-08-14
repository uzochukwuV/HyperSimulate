import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Book, CheckCircle, AlertCircle, Clock } from "lucide-react";

interface HealthStatus {
  status: "healthy" | "unhealthy";
  timestamp: string;
  services: {
    hyperevm: {
      status: "online" | "offline";
      latestBlock: string;
    };
    database: {
      status: "online" | "offline";
    };
    websocket: {
      status: "online" | "offline";
      connectedClients: number;
    };
  };
  error?: string;
}

export default function ApiEndpoints() {
  const { data: health, isLoading } = useQuery<HealthStatus>({
    queryKey: ["/api/admin/health"],
    refetchInterval: 30000,
  });

  const apiEndpoints = [
    {
      method: "POST",
      path: "/api/v1/simulate",
      description: "Simulate transaction execution against current or historical state",
      rateLimit: "100/min",
      avgTime: "200ms",
      requestBody: `{
  "transaction": {
    "from": "0x...",
    "to": "0x...", 
    "data": "0x...",
    "value": "0",
    "gasLimit": "21000"
  },
  "blockNumber": "latest"
}`,
    },
    {
      method: "GET",
      path: "/api/v1/gas-estimate",
      description: "Get accurate gas estimates for transaction execution",
      rateLimit: "1000/min",
      avgTime: "50ms",
    },
    {
      method: "POST",
      path: "/api/v1/bundle-simulate",
      description: "Simulate bundle of interdependent transactions",
      rateLimit: "50/min",
      avgTime: "500ms",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
      case "healthy":
        return "hyper-green";
      case "offline":
      case "unhealthy":
        return "hyper-red";
      default:
        return "hyper-grey";
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET":
        return "hyper-green";
      case "POST":
        return "hyper-teal";
      case "PUT":
        return "yellow-500";
      case "DELETE":
        return "hyper-red";
      default:
        return "hyper-grey";
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold" data-testid="title-system-health">System Health & API Integration</h2>
      
      {/* System Status */}
      <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <CheckCircle className="text-hyper-green mr-2" size={20} />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4 text-hyper-grey">Loading system status...</div>
          ) : health ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-hyper-dark border-hyper-dark-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-hyper-grey">HyperEVM</span>
                    <Badge className={`bg-${getStatusColor(health.services.hyperevm.status)} text-hyper-dark`} data-testid="status-hyperevm">
                      {health.services.hyperevm.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-hyper-grey" data-testid="hyperevm-block">
                    Latest Block: {parseInt(health.services.hyperevm.latestBlock, 16).toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-hyper-dark border-hyper-dark-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-hyper-grey">Database</span>
                    <Badge className={`bg-${getStatusColor(health.services.database.status)} text-hyper-dark`} data-testid="status-database">
                      {health.services.database.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-hyper-grey">In-memory storage</div>
                </CardContent>
              </Card>

              <Card className="bg-hyper-dark border-hyper-dark-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-hyper-grey">WebSocket</span>
                    <Badge className={`bg-${getStatusColor(health.services.websocket.status)} text-hyper-dark`} data-testid="status-websocket">
                      {health.services.websocket.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-hyper-grey" data-testid="websocket-clients">
                    Connected: {health.services.websocket.connectedClients} clients
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-4 text-hyper-red">Failed to load system status</div>
          )}
        </CardContent>
      </Card>

      {/* API Endpoints */}
      <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center text-lg">
              REST API Endpoints
            </CardTitle>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-hyper-green rounded-full"></div>
              <span className="text-sm text-hyper-grey" data-testid="api-version">API v1.0 - Production</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {apiEndpoints.map((endpoint, index) => (
            <Card key={index} className="bg-hyper-dark border-hyper-dark-border" data-testid={`endpoint-${index}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <Badge className={`bg-${getMethodColor(endpoint.method)} text-hyper-dark font-mono text-xs`}>
                      {endpoint.method}
                    </Badge>
                    <code className="font-mono text-sm text-hyper-teal" data-testid={`endpoint-path-${index}`}>
                      {endpoint.path}
                    </code>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-hyper-grey">
                    <span data-testid={`endpoint-rate-limit-${index}`}>Rate Limit: {endpoint.rateLimit}</span>
                    <span>•</span>
                    <span className="text-hyper-green" data-testid={`endpoint-avg-time-${index}`}>{endpoint.avgTime} avg</span>
                  </div>
                </div>
                <p className="text-sm text-hyper-grey mb-3" data-testid={`endpoint-description-${index}`}>
                  {endpoint.description}
                </p>
                {endpoint.requestBody && (
                  <div className="bg-hyper-dark-darker rounded p-3 font-mono text-xs text-hyper-grey border border-hyper-dark-border">
                    <div className="text-hyper-teal mb-1">Request Body:</div>
                    <pre className="whitespace-pre-wrap" data-testid={`endpoint-request-body-${index}`}>
                      {endpoint.requestBody}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      {/* API Documentation */}
      <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-hyper-grey">
              Base URL:{" "}
              <code className="text-hyper-teal font-mono" data-testid="api-base-url">
                https://api.hyperevm-simulator.com
              </code>
            </div>
            <Button 
              className="bg-hyper-teal text-hyper-dark hover:bg-hyper-teal/90 font-medium"
              data-testid="button-view-docs"
            >
              <Book className="w-4 h-4 mr-2" />
              View Full Documentation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
