import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Fuel, Coins, Activity, Code, Zap, Clock } from "lucide-react";

interface SimulationResultsProps {
  result: {
    simulationId: string;
    result: {
      success: boolean;
      gasUsed: number;
      gasLimit: number;
      transactionFee: string;
      executionTrace: Array<{
        type: "CALL" | "RETURN" | "REVERT" | "CREATE";
        depth: number;
        from?: string;
        to?: string;
        value?: string;
        gasUsed: number;
        gasRemaining: number;
        output?: string;
        error?: string;
      }>;
      stateChanges: Array<{
        address: string;
        slot: string;
        previousValue: string;
        newValue: string;
      }>;
      events: Array<{
        address: string;
        topics: string[];
        data: string;
        decoded?: {
          name: string;
          inputs: Array<{
            name: string;
            type: string;
            value: any;
          }>;
        };
      }>;
      gasBreakdown: {
        intrinsicGas: number;
        executionGas: number;
        storageGas: number;
        memoryGas: number;
      };
      errorMessage?: string;
      returnValue?: string;
    };
  };
}

export default function SimulationResults({ result }: SimulationResultsProps) {
  const [activeTab, setActiveTab] = useState("trace");
  const { result: simResult } = result;

  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatGas = (gas: number) => {
    return gas.toLocaleString();
  };

  const getStatusColor = () => {
    return simResult.success ? "hyper-green" : "hyper-red";
  };

  const getGasUsagePercentage = () => {
    return Math.round((simResult.gasUsed / simResult.gasLimit) * 100);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold" data-testid="title-simulation-results">Simulation Results</h2>
      
      {/* Status Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className={`bg-hyper-dark-lighter border-${getStatusColor()}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Execution Status</h3>
              <div className={`w-3 h-3 bg-${getStatusColor()} rounded-full`}></div>
            </div>
            <div className={`text-3xl font-bold text-${getStatusColor()} mb-2`} data-testid="text-execution-status">
              {simResult.success ? "Success" : "Failed"}
            </div>
            <p className="text-sm text-hyper-grey">
              {simResult.success ? "Transaction executed successfully" : simResult.errorMessage || "Transaction failed"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-hyper-dark-lighter border-hyper-teal">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Gas Used</h3>
              <Fuel className="text-hyper-teal" size={20} />
            </div>
            <div className="text-3xl font-bold text-hyper-teal mb-2 font-mono" data-testid="text-gas-used">
              {formatGas(simResult.gasUsed)}
            </div>
            <p className="text-sm text-hyper-grey">
              of {formatGas(simResult.gasLimit)} limit ({getGasUsagePercentage()}%)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Transaction Fee</h3>
              <Coins className="text-hyper-grey" size={20} />
            </div>
            <div className="text-3xl font-bold text-white mb-2 font-mono" data-testid="text-transaction-fee">
              {simResult.transactionFee}
            </div>
            <p className="text-sm text-hyper-grey">ETH (~$2.45)</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Results */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
        <CardHeader>
          
            <TabsList className="bg-transparent border-b border-hyper-dark-border rounded-none p-0">
              <TabsTrigger 
                value="trace" 
                className="data-[state=active]:text-hyper-teal data-[state=active]:border-b-2 data-[state=active]:border-hyper-teal rounded-none"
                data-testid="tab-execution-trace"
              >
                Execution Trace
              </TabsTrigger>
              <TabsTrigger 
                value="state" 
                className="data-[state=active]:text-hyper-teal data-[state=active]:border-b-2 data-[state=active]:border-hyper-teal rounded-none"
                data-testid="tab-state-changes"
              >
                State Changes
              </TabsTrigger>
              <TabsTrigger 
                value="events" 
                className="data-[state=active]:text-hyper-teal data-[state=active]:border-b-2 data-[state=active]:border-hyper-teal rounded-none"
                data-testid="tab-events-logs"
              >
                Events & Logs
              </TabsTrigger>
              <TabsTrigger 
                value="gas" 
                className="data-[state=active]:text-hyper-teal data-[state=active]:border-b-2 data-[state=active]:border-hyper-teal rounded-none"
                data-testid="tab-gas-breakdown"
              >
                Gas Breakdown
              </TabsTrigger>
              <TabsTrigger 
                value="hyperevm" 
                className="data-[state=active]:text-hyper-teal data-[state=active]:border-b-2 data-[state=active]:border-hyper-teal rounded-none"
                data-testid="tab-hyperevm-analysis"
              >
                HyperEVM Analysis
              </TabsTrigger>
            </TabsList>
          
        </CardHeader>
        <CardContent>
          <TabsContent value="trace" className="space-y-4 mt-0">
            <div className="space-y-4">
              {simResult.executionTrace.map((step, index) => (
                <div key={index} className="simulation-trace-item" data-testid={`trace-item-${index}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <Badge 
                        className={`trace-badge ${step.type.toLowerCase()}`}
                        data-testid={`badge-${step.type.toLowerCase()}`}
                      >
                        {step.type}
                      </Badge>
                      <span className="font-mono text-sm text-hyper-grey">Depth: {step.depth}</span>
                    </div>
                    <span className="text-xs text-hyper-grey font-mono" data-testid={`gas-${index}`}>
                      Gas: {formatGas(step.gasUsed)}
                    </span>
                  </div>
                  <div className="font-mono text-sm space-y-1">
                    {step.from && (
                      <div className="text-hyper-grey">
                        From: <span className="text-white" data-testid={`from-${index}`}>{formatAddress(step.from)}</span>
                      </div>
                    )}
                    {step.to && (
                      <div className="text-hyper-grey">
                        To: <span className="text-white" data-testid={`to-${index}`}>{formatAddress(step.to)}</span>
                      </div>
                    )}
                    {step.value && step.value !== "0" && (
                      <div className="text-hyper-grey">
                        Value: <span className="text-hyper-green" data-testid={`value-${index}`}>{step.value} ETH</span>
                      </div>
                    )}
                    {step.output && (
                      <div className="text-hyper-grey">
                        Output: <span className="text-hyper-green" data-testid={`output-${index}`}>{step.output}</span>
                      </div>
                    )}
                    {step.error && (
                      <div className="text-hyper-grey">
                        Error: <span className="text-hyper-red" data-testid={`error-${index}`}>{step.error}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="state" className="mt-0">
            {simResult.stateChanges.length > 0 ? (
              <div className="space-y-4">
                {simResult.stateChanges.map((change, index) => (
                  <div key={index} className="code-block" data-testid={`state-change-${index}`}>
                    <div className="font-mono text-sm space-y-2">
                      <div>
                        <span className="text-hyper-grey">Address:</span>{" "}
                        <span className="text-hyper-teal">{change.address}</span>
                      </div>
                      <div>
                        <span className="text-hyper-grey">Slot:</span>{" "}
                        <span className="text-white">{change.slot}</span>
                      </div>
                      <div>
                        <span className="text-hyper-grey">Previous:</span>{" "}
                        <span className="text-hyper-red">{change.previousValue}</span>
                      </div>
                      <div>
                        <span className="text-hyper-grey">New:</span>{" "}
                        <span className="text-hyper-green">{change.newValue}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-hyper-grey">
                No state changes detected
              </div>
            )}
          </TabsContent>

          <TabsContent value="events" className="mt-0">
            {simResult.events.length > 0 ? (
              <div className="space-y-4">
                {simResult.events.map((event, index) => (
                  <div key={index} className="code-block" data-testid={`event-${index}`}>
                    <div className="font-mono text-sm space-y-2">
                      <div>
                        <span className="text-hyper-grey">Address:</span>{" "}
                        <span className="text-hyper-teal">{event.address}</span>
                      </div>
                      <div>
                        <span className="text-hyper-grey">Topics:</span>{" "}
                        <span className="text-white">{event.topics.join(", ")}</span>
                      </div>
                      <div>
                        <span className="text-hyper-grey">Data:</span>{" "}
                        <span className="text-hyper-green">{event.data}</span>
                      </div>
                      {event.decoded && (
                        <div>
                          <span className="text-hyper-grey">Decoded:</span>{" "}
                          <span className="text-hyper-teal">{event.decoded.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-hyper-grey">
                No events emitted
              </div>
            )}
          </TabsContent>

          <TabsContent value="gas" className="mt-0">
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-hyper-dark border-hyper-dark-border">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Zap className="text-hyper-teal" size={16} />
                    <span className="text-sm font-medium">Intrinsic Gas</span>
                  </div>
                  <div className="text-xl font-mono font-bold" data-testid="gas-intrinsic">
                    {formatGas(simResult.gasBreakdown.intrinsicGas)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-hyper-dark border-hyper-dark-border">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Activity className="text-hyper-green" size={16} />
                    <span className="text-sm font-medium">Execution Gas</span>
                  </div>
                  <div className="text-xl font-mono font-bold" data-testid="gas-execution">
                    {formatGas(simResult.gasBreakdown.executionGas)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-hyper-dark border-hyper-dark-border">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Code className="text-hyper-grey" size={16} />
                    <span className="text-sm font-medium">Storage Gas</span>
                  </div>
                  <div className="text-xl font-mono font-bold" data-testid="gas-storage">
                    {formatGas(simResult.gasBreakdown.storageGas)}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-hyper-dark border-hyper-dark-border">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Clock className="text-hyper-grey" size={16} />
                    <span className="text-sm font-medium">Memory Gas</span>
                  </div>
                  <div className="text-xl font-mono font-bold" data-testid="gas-memory">
                    {formatGas(simResult.gasBreakdown.memoryGas)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="hyperevm" className="mt-0">
            <div className="space-y-6">
              {/* HyperEVM-specific metrics */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-hyper-dark border-hyper-teal">
                  <CardContent className="p-4">
                    <h4 className="text-lg font-medium text-hyper-teal mb-3">Precompile Analysis</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Oracle Calls:</span>
                        <span className="font-mono">{simResult.analysis?.gasAnalysis?.precompileBreakdown?.reads || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">CoreWriter Calls:</span>
                        <span className="font-mono">{simResult.analysis?.gasAnalysis?.precompileBreakdown?.writes || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Precompile Gas:</span>
                        <span className="font-mono text-hyper-teal">
                          {formatGas((simResult.analysis?.gasAnalysis?.coreWriterGas || 0) + (simResult.analysis?.gasAnalysis?.oracleReadGas || 0))}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-hyper-dark border-hyper-dark-border">
                  <CardContent className="p-4">
                    <h4 className="text-lg font-medium text-hyper-grey mb-3">Network Metrics</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Chain ID:</span>
                        <span className="font-mono">999 (HyperEVM)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Gas Token:</span>
                        <span className="font-mono text-hyper-green">HYPE</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Estimated Cost:</span>
                        <span className="font-mono text-hyper-teal">
                          {simResult.analysis?.gasAnalysis?.estimatedCost || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Security insights specific to HyperEVM */}
              {simResult.analysis?.securityInsights && simResult.analysis.securityInsights.length > 0 && (
                <Card className="bg-hyper-dark border-hyper-dark-border">
                  <CardContent className="p-4">
                    <h4 className="text-lg font-medium text-hyper-grey mb-3">Security Analysis</h4>
                    <div className="space-y-3">
                      {simResult.analysis.securityInsights.map((insight, index) => (
                        <div key={index} className="p-3 rounded border border-hyper-dark-border bg-hyper-dark-lighter">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">{insight.type}</span>
                            <Badge className={`${
                              insight.severity === 'HIGH' ? 'bg-hyper-red' : 
                              insight.severity === 'MEDIUM' ? 'bg-yellow-600' : 'bg-hyper-green'
                            } text-white`}>
                              {insight.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-hyper-grey mb-2">{insight.description}</p>
                          {insight.recommendation && (
                            <p className="text-xs text-hyper-teal">{insight.recommendation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Optimization suggestions */}
              {simResult.analysis?.optimizationSuggestions && simResult.analysis.optimizationSuggestions.length > 0 && (
                <Card className="bg-hyper-dark border-hyper-dark-border">
                  <CardContent className="p-4">
                    <h4 className="text-lg font-medium text-hyper-grey mb-3">💡 Optimization Suggestions</h4>
                    <div className="space-y-3">
                      {simResult.analysis.optimizationSuggestions.map((suggestion, index) => (
                        <div key={index} className="p-3 rounded border border-hyper-teal bg-hyper-dark-lighter">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-hyper-teal">{suggestion.type}</span>
                            <span className="text-xs text-hyper-green">{suggestion.potentialSavings}</span>
                          </div>
                          <p className="text-sm text-hyper-grey mb-2">{suggestion.description}</p>
                          {suggestion.implementation && (
                            <p className="text-xs text-hyper-grey italic">{suggestion.implementation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Risk Assessment */}
              {simResult.analysis?.riskAssessment && (
                <Card className="bg-hyper-dark border-hyper-dark-border">
                  <CardContent className="p-4">
                    <h4 className="text-lg font-medium text-hyper-grey mb-3">🔍 Risk Assessment</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-hyper-grey">Overall Risk:</span>
                        <Badge className={`${
                          simResult.analysis.riskAssessment.overallRisk === 'HIGH' ? 'bg-hyper-red' : 
                          simResult.analysis.riskAssessment.overallRisk === 'MEDIUM' ? 'bg-yellow-600' : 'bg-hyper-green'
                        } text-white`}>
                          {simResult.analysis.riskAssessment.overallRisk}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-hyper-grey">Confidence Score:</span>
                        <span className="font-mono text-hyper-teal">
                          {simResult.analysis.riskAssessment.confidenceScore}%
                        </span>
                      </div>
                      
                      {simResult.analysis.riskAssessment.riskFactors.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-hyper-grey mb-2">Risk Factors:</h5>
                          <ul className="list-disc list-inside space-y-1">
                            {simResult.analysis.riskAssessment.riskFactors.map((factor, index) => (
                              <li key={index} className="text-sm text-hyper-grey">{factor}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {simResult.analysis.riskAssessment.mitigationSuggestions.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-hyper-teal mb-2">Mitigation Suggestions:</h5>
                          <ul className="list-disc list-inside space-y-1">
                            {simResult.analysis.riskAssessment.mitigationSuggestions.map((suggestion, index) => (
                              <li key={index} className="text-sm text-hyper-grey">{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </CardContent>
      </Card>
      </Tabs>
    </div>
  );
}
