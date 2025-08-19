import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Search, 
  Play, 
  GitFork, 
  CheckCircle, 
  AlertCircle, 
  Zap,
  Clock,
  Database,
  Brain,
  Layers,
  ArrowRight,
  Copy,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TransactionReplayProps {
  onReplayComplete?: (result: any) => void;
}

interface ReplayStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  icon: any;
}

interface TransactionDetails {
  hash: string;
  from: string;
  to?: string;
  value: string;
  gasLimit: string;
  gasPrice: string;
  nonce: number;
  blockNumber: number;
  data?: string;
}

interface SimulationForm {
  formId: string;
  transactionHash: string;
  title: string;
  prefilledData: TransactionDetails;
  suggestedModifications: any[];
  contractAnalysis: any[];
  debuggingHints: string[];
}

interface ReplayResult {
  requestId: string;
  originalTransaction: any;
  originalReceipt: any;
  replayTransaction: any;
  replayResult: {
    success: boolean;
    gasUsed: number;
    executionTrace: any[];
    stateChanges: any[];
    events: any[];
    analysis: {
      gasAnalysis: any;
      eventAnalysis: any;
      performanceMetrics: any;
      securityInsights: string[];
      optimizationSuggestions: string[];
    };
  };
  forkInfo: {
    forkBlock: string;
    forkStateRoot: string;
    contractsAvailable: number;
  };
  comparison: {
    gasUsedDiff: number;
    stateDiff: any[];
    eventsDiff: any[];
  };
  insights: {
    replayAccuracy: 'EXACT' | 'CLOSE' | 'DIVERGENT';
    possibleReasons: string[];
    recommendations: string[];
  };
}

export default function TransactionReplay({ onReplayComplete }: TransactionReplayProps) {
  const [txHash, setTxHash] = useState("");
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [replayProgress, setReplayProgress] = useState(0);
  const [simulationForm, setSimulationForm] = useState<SimulationForm | null>(null);
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const { toast } = useToast();

  const replaySteps: ReplayStep[] = [
    {
      id: 'fetch',
      title: 'Fetch Transaction',
      description: 'Get transaction details by hash',
      status: 'pending',
      icon: Search
    },
    {
      id: 'fork',
      title: 'Create Fork',
      description: 'Fork mainnet at the transaction\'s block - 1',
      status: 'pending',
      icon: GitFork
    },
    {
      id: 'contracts',
      title: 'Load Contracts',
      description: 'Automatically preserve all deployed smart contracts',
      status: 'pending',
      icon: Database
    },
    {
      id: 'form',
      title: 'Pre-fill Form',
      description: 'Generate intelligent simulation form with suggestions',
      status: 'pending',
      icon: Brain
    },
    {
      id: 'execute',
      title: 'Execute Replay',
      description: 'Run transaction on forked state with modifications',
      status: 'pending',
      icon: Play
    },
    {
      id: 'analyze',
      title: 'Generate Insights',
      description: 'Provide actionable debugging recommendations',
      status: 'pending',
      icon: Zap
    }
  ];

  const [steps, setSteps] = useState(replaySteps);

  const updateStepStatus = (stepId: string, status: ReplayStep['status']) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, status } : step
    ));
  };

  // Create simulation form from transaction hash
  const createFormMutation = useMutation({
    mutationFn: async (transactionHash: string) => {
      const response = await fetch('/api/v1/replay/create-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionHash })
      });
      if (!response.ok) throw new Error('Failed to create form');
      return response.json();
    },
    onMutate: () => {
      setActiveStep('fetch');
      updateStepStatus('fetch', 'in_progress');
      setReplayProgress(10);
    },
    onSuccess: (data) => {
      updateStepStatus('fetch', 'completed');
      updateStepStatus('fork', 'completed');
      updateStepStatus('contracts', 'completed');
      updateStepStatus('form', 'completed');
      console.log(data)
      setSimulationForm(data.data);
      setReplayProgress(70);
      toast({
        title: "Form Created",
        description: "Transaction analysis complete. Ready for replay!"
      });
    },
    onError: (error) => {
      updateStepStatus('fetch', 'failed');
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Execute transaction replay
  const replayMutation = useMutation({
    mutationFn: async (modifications: any = {}) => {
      const response = await fetch('/api/v1/replay/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transactionHash: txHash,
          modifications
        })
      });
      if (!response.ok) throw new Error('Failed to execute replay');
      return response.json();
    },
    onMutate: () => {
      setActiveStep('execute');
      updateStepStatus('execute', 'in_progress');
      setReplayProgress(80);
    },
    onSuccess: (data) => {
      updateStepStatus('execute', 'completed');
      updateStepStatus('analyze', 'completed');
      console.log(data)
      setReplayResult(data.data);
      setReplayProgress(100);
      onReplayComplete?.(data);
      toast({
        title: "Replay Complete",
        description: `Replay accuracy: ${data.data.insights.replayAccuracy}`
      });
    },
    onError: (error) => {
      updateStepStatus('execute', 'failed');
      toast({
        title: "Replay Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleStartReplay = async () => {
    if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      toast({
        title: "Invalid Transaction Hash",
        description: "Please enter a valid 64-character hex transaction hash",
        variant: "destructive"
      });
      return;
    }

    try {
      await createFormMutation.mutateAsync(txHash);
    } catch (error) {
      console.error('Replay failed:', error);
    }
  };

  const handleExecuteReplay = () => {
    replayMutation.mutate({});
  };

  // Test RPC connectivity
  const testRpcMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/debug/rpc-test');
      if (!response.ok) throw new Error('RPC test failed');
      return response.json();
    },
    onSuccess: (data) => {
      console.log('RPC Test Results:', data);
      toast({
        title: "RPC Test Complete",
        description: `Chain ID: ${data.testResults.chainId}, Block: ${data.testResults.blockNumber}`
      });
    },
    onError: (error) => {
      console.error('RPC Test Error:', error);
      toast({
        title: "RPC Test Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Test transaction fetching with a known transaction hash
  const testTransactionMutation = useMutation({
    mutationFn: async (testTxHash: string) => {
      const response = await fetch(`/api/v1/replay/transaction/${testTxHash}`);
      if (!response.ok) throw new Error(`Failed to fetch transaction: ${response.statusText}`);
      return response.json();
    },
    onSuccess: (data) => {
      console.log('Transaction Test Results:', data);
      toast({
        title: "Transaction Test Success",
        description: `Found transaction from block ${data.data.transaction.blockNumber}`
      });
    },
    onError: (error) => {
      console.error('Transaction Test Error:', error);
      toast({
        title: "Transaction Test Failed", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Address copied to clipboard"
    });
  };

  const getAccuracyColor = (accuracy: string) => {
    switch (accuracy) {
      case 'EXACT': return 'text-green-400';
      case 'CLOSE': return 'text-yellow-400';
      case 'DIVERGENT': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusColor = (status: ReplayStep['status']) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'in_progress': return 'text-blue-400';
      case 'failed': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-hyper-teal/20 rounded-lg">
          <RotateCcw className="h-6 w-6 text-hyper-teal" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Transaction Replay</h1>
          <p className="text-hyper-grey">
            Debug any HyperEVM transaction with one-click replay and analysis
          </p>
        </div>
      </div>

      <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5 text-hyper-teal" />
            <span>Transaction Hash</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-3">
            <Input
              placeholder="0x..."
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              className="flex-1 bg-hyper-dark border-hyper-dark-border text-white"
            />
            <Button 
              onClick={handleStartReplay}
              disabled={createFormMutation.isPending || !txHash}
              className="bg-hyper-teal hover:bg-hyper-teal/90"
            >
              {createFormMutation.isPending ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Start Replay
                </>
              )}
            </Button>
            <Button
              onClick={() => setDebugMode(!debugMode)}
              variant="outline"
              size="sm"
              className="border-hyper-dark-border text-hyper-grey hover:text-white"
            >
              Debug
            </Button>
          </div>

          {debugMode && (
            <div className="mt-4 p-4 bg-hyper-dark rounded-lg border border-hyper-dark-border">
              <h3 className="text-sm font-medium text-white mb-3">Debug Tools</h3>
              <div className="flex space-x-2">
                <Button
                  onClick={() => testRpcMutation.mutate()}
                  disabled={testRpcMutation.isPending}
                  size="sm"
                  variant="outline"
                  className="border-hyper-dark-border"
                >
                  {testRpcMutation.isPending ? (
                    <>
                      <Clock className="h-3 w-3 mr-1 animate-spin" />
                      Testing RPC...
                    </>
                  ) : (
                    'Test RPC'
                  )}
                </Button>
                <Button
                  onClick={() => {
                    // Use a sample transaction hash if none provided
                    const testHash = txHash || "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
                    testTransactionMutation.mutate(testHash);
                  }}
                  disabled={testTransactionMutation.isPending}
                  size="sm"
                  variant="outline"
                  className="border-hyper-dark-border"
                >
                  {testTransactionMutation.isPending ? (
                    <>
                      <Clock className="h-3 w-3 mr-1 animate-spin" />
                      Testing TX...
                    </>
                  ) : (
                    'Test TX Fetch'
                  )}
                </Button>
              </div>
              <p className="text-xs text-hyper-grey mt-2">
                Use these tools to debug RPC connectivity and transaction fetching issues.
              </p>
            </div>
          )}

          {replayProgress > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-hyper-grey">Progress</span>
                <span className="text-hyper-teal">{replayProgress}%</span>
              </div>
              <Progress value={replayProgress} className="bg-hyper-dark" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workflow Steps */}
      <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Layers className="h-5 w-5 text-hyper-purple" />
            <span>Replay Workflow</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = activeStep === step.id;
              const statusColor = getStatusColor(step.status);
              
              return (
                <div 
                  key={step.id}
                  className={`flex items-start space-x-4 p-4 rounded-lg transition-all ${
                    isActive ? 'bg-hyper-dark ring-1 ring-hyper-teal/50' : 'bg-hyper-dark/50'
                  }`}
                >
                  <div className={`p-2 rounded-full ${
                    step.status === 'completed' ? 'bg-green-400/20' :
                    step.status === 'in_progress' ? 'bg-blue-400/20' :
                    step.status === 'failed' ? 'bg-red-400/20' :
                    'bg-gray-400/20'
                  }`}>
                    {step.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : step.status === 'failed' ? (
                      <AlertCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <Icon className={`h-4 w-4 ${statusColor} ${
                        step.status === 'in_progress' ? 'animate-pulse' : ''
                      }`} />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-medium ${statusColor}`}>
                      {step.title}
                    </h3>
                    <p className="text-sm text-hyper-grey mt-1">
                      {step.description}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-hyper-grey mt-2" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Simulation Form */}
      {simulationForm && (
        <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-hyper-orange" />
              <span>Pre-filled Simulation Form</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="transaction" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-hyper-dark">
                <TabsTrigger value="transaction">Transaction</TabsTrigger>
                <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
                <TabsTrigger value="contracts">Contracts</TabsTrigger>
                <TabsTrigger value="hints">Debug Hints</TabsTrigger>
              </TabsList>

              <TabsContent value="transaction" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-hyper-grey">From</label>
                    <div className="flex items-center space-x-2 mt-1">
                      <code className="text-sm bg-hyper-dark p-2 rounded font-mono">
                        {simulationForm.prefilledData?.from || "no from"}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(simulationForm.prefilledData.from)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-hyper-grey">To</label>
                    <div className="flex items-center space-x-2 mt-1">
                      <code className="text-sm bg-hyper-dark p-2 rounded font-mono">
                        {simulationForm.prefilledData.to || 'Contract Creation'}
                      </code>
                      {simulationForm.prefilledData.to && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(simulationForm.prefilledData.to!)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-hyper-grey">Value</label>
                    <p className="text-sm bg-hyper-dark p-2 rounded font-mono mt-1">
                      {simulationForm.prefilledData.value} ETH
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-hyper-grey">Gas Limit</label>
                    <p className="text-sm bg-hyper-dark p-2 rounded font-mono mt-1">
                      {simulationForm.prefilledData.gasLimit}
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="suggestions" className="space-y-3">
                {simulationForm.suggestedModifications?.length > 0 ? (
                  simulationForm.suggestedModifications.map((suggestion, index) => (
                    <Alert key={index}>
                      <Brain className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{suggestion.type}:</strong> {suggestion.description}
                      </AlertDescription>
                    </Alert>
                  ))
                ) : (
                  <Alert>
                    <AlertDescription>
                      No modifications suggested. Transaction appears optimal for replay.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="contracts" className="space-y-3">
                {simulationForm.contractAnalysis?.length > 0 ? (
                  simulationForm.contractAnalysis.map((contract, index) => (
                    <div key={index} className="bg-hyper-dark p-4 rounded-lg">
                      <div className="flex items-center justify-between">
                        <code className="font-mono text-sm">{contract.address}</code>
                        <Badge variant="secondary">{contract.type}</Badge>
                      </div>
                      <p className="text-sm text-hyper-grey mt-2">{contract.description}</p>
                    </div>
                  ))
                ) : (
                  <Alert>
                    <AlertDescription>
                      Contract analysis will be available after transaction fetch.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="hints" className="space-y-3">
                {simulationForm.debuggingHints?.length > 0 ? (
                  simulationForm.debuggingHints.map((hint, index) => (
                    <Alert key={index}>
                      <Zap className="h-4 w-4" />
                      <AlertDescription>{hint}</AlertDescription>
                    </Alert>
                  ))
                ) : (
                  <Alert>
                    <AlertDescription>
                      Debugging hints will be generated based on transaction analysis.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex justify-end">
              <Button 
                onClick={handleExecuteReplay}
                disabled={replayMutation.isPending}
                className="bg-hyper-purple hover:bg-hyper-purple/90"
              >
                {replayMutation.isPending ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Executing Replay...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Execute Replay
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Replay Results */}
      {replayResult && (
        <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <span>Replay Results</span>
              <Badge className={getAccuracyColor(replayResult.replayAccuracy)}>
                {replayResult.replayAccuracy}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="comparison" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-hyper-dark">
                <TabsTrigger value="comparison">Gas Comparison</TabsTrigger>
                <TabsTrigger value="states">State Changes</TabsTrigger>
                <TabsTrigger value="events">Event Analysis</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
              </TabsList>

              <TabsContent value="comparison" className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-medium text-white mb-3">Original Transaction</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Gas Used:</span>
                        <span className="font-mono">
                          {parseInt(replayResult.originalReceipt.gasUsed, 16).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Status:</span>
                        <Badge className={replayResult.originalReceipt.status === '0x1' ? 'bg-green-500' : 'bg-red-500'}>
                          {replayResult.originalReceipt.status === '0x1' ? 'Success' : 'Failed'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Logs Count:</span>
                        <span className="font-mono">{replayResult.originalReceipt.logs?.length || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-medium text-white mb-3">Replay Transaction</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Gas Used:</span>
                        <span className="font-mono">{replayResult.replayResult.gasUsed.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Status:</span>
                        <Badge className={replayResult.replayResult.success ? 'bg-green-500' : 'bg-red-500'}>
                          {replayResult.replayResult.success ? 'Success' : 'Failed'}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Events Count:</span>
                        <span className="font-mono">{replayResult.replayResult.events?.length || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-hyper-grey">Gas Difference:</span>
                        <span className={`font-mono ${
                          replayResult.comparison.gasUsedDiff > 0 ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {replayResult.comparison.gasUsedDiff > 0 ? '+' : ''}
                          {replayResult.comparison.gasUsedDiff.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Fork Information */}
                <div className="mt-6 p-4 bg-hyper-dark/50 rounded-lg">
                  <h3 className="font-medium text-white mb-3">Fork Information</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-hyper-grey">Fork Block:</span>
                      <p className="font-mono">{parseInt(replayResult.forkInfo.forkBlock, 16).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-hyper-grey">Contracts Available:</span>
                      <p className="font-mono">{replayResult.forkInfo.contractsAvailable}</p>
                    </div>
                    <div>
                      <span className="text-hyper-grey">Replay Mode:</span>
                      <p className="font-mono">Lightweight</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="states" className="space-y-3">
                {replayResult.comparison.stateDiff?.length > 0 ? (
                  replayResult.comparison.stateDiff.map((change, index) => (
                    <div key={index} className="bg-hyper-dark p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <code className="font-mono text-sm">{change.address}</code>
                        <Badge variant="outline">{change.type}</Badge>
                      </div>
                      <div className="text-sm space-y-1">
                        <div className="text-red-400">Original: {change.original}</div>
                        <div className="text-green-400">Replay: {change.replay}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <Alert>
                    <AlertDescription>
                      No state changes detected between original and replay transactions.
                    </AlertDescription>
                  </Alert>
                )}
                
                {/* Execution Trace */}
                {replayResult.replayResult.executionTrace?.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-medium text-white mb-3">Execution Trace</h3>
                    <div className="space-y-2">
                      {replayResult.replayResult.executionTrace.map((trace, index) => (
                        <div key={index} className="bg-hyper-dark/50 p-3 rounded text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-hyper-teal">{trace.type}</span>
                            <span className="text-hyper-grey">Depth: {trace.depth}</span>
                          </div>
                          <div className="text-xs text-hyper-grey mt-1">
                            From: {trace.from} → To: {trace.to}
                          </div>
                          <div className="text-xs text-hyper-grey">
                            Gas Used: {trace.gasUsed} | Remaining: {trace.gasRemaining}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="events" className="space-y-3">
                {/* Original Transaction Events */}
                <div>
                  <h3 className="font-medium text-white mb-3">Original Transaction Events ({replayResult.originalReceipt.logs?.length || 0})</h3>
                  {replayResult.originalReceipt.logs?.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {replayResult.originalReceipt.logs.map((log, index) => (
                        <div key={index} className="bg-hyper-dark p-3 rounded text-sm">
                          <div className="flex justify-between items-center mb-2">
                            <code className="font-mono text-xs">{log.address}</code>
                            <Badge variant="outline">Log {index + 1}</Badge>
                          </div>
                          <div className="text-xs text-hyper-grey">
                            Topics: {log.topics.length}
                            {log.topics[0] && (
                              <span className="ml-2">
                                {log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' ? 
                                  '(Transfer)' : 
                                  log.topics[0] === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925' ?
                                  '(Approval)' : ''
                                }
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Alert>
                      <AlertDescription>No events in original transaction.</AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Event Differences */}
                {replayResult.comparison.eventsDiff?.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-medium text-white mb-3">Event Differences</h3>
                    <div className="space-y-2">
                      {replayResult.comparison.eventsDiff.map((diff, index) => (
                        <Alert key={index} className="border-yellow-400/50">
                          <AlertCircle className="h-4 w-4 text-yellow-400" />
                          <AlertDescription>
                            <strong>{diff.type}:</strong> {diff.event.description}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Gas Analysis */}
                {replayResult.replayResult.analysis?.gasAnalysis && (
                  <div className="mt-6">
                    <h3 className="font-medium text-white mb-3">Gas Analysis</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-hyper-dark/50 p-3 rounded">
                        <span className="text-hyper-grey">Efficiency:</span>
                        <p className="font-mono text-hyper-teal">{replayResult.replayResult.analysis.gasAnalysis.efficiency}</p>
                      </div>
                      <div className="bg-hyper-dark/50 p-3 rounded">
                        <span className="text-hyper-grey">External Calls:</span>
                        <p className="font-mono">{replayResult.replayResult.analysis.gasAnalysis.externalCalls}</p>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="insights" className="space-y-4">
                <div className="space-y-4">
                  {/* Replay Accuracy Summary */}
                  <div className="p-4 bg-hyper-dark/50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-white">Replay Accuracy</h3>
                      <Badge className={getAccuracyColor(replayResult.insights.replayAccuracy)}>
                        {replayResult.insights.replayAccuracy}
                      </Badge>
                    </div>
                    <p className="text-sm text-hyper-grey">
                      {replayResult.insights.replayAccuracy === 'EXACT' && 
                        'Perfect replay match. The simulation exactly replicated the original transaction behavior.'}
                      {replayResult.insights.replayAccuracy === 'CLOSE' && 
                        'Close replay match. Minor differences detected but overall behavior is consistent.'}
                      {replayResult.insights.replayAccuracy === 'DIVERGENT' && 
                        'Significant differences detected. The replay diverged from the original transaction behavior.'}
                    </p>
                  </div>

                  {/* Possible Reasons */}
                  {replayResult.insights.possibleReasons?.length > 0 && (
                    <div>
                      <h3 className="font-medium text-white mb-3">Analysis</h3>
                      <div className="space-y-2">
                        {replayResult.insights.possibleReasons.map((reason, index) => (
                          <Alert key={index} className="border-orange-400/50">
                            <AlertCircle className="h-4 w-4 text-orange-400" />
                            <AlertDescription>{reason}</AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {replayResult.insights.recommendations?.length > 0 && (
                    <div>
                      <h3 className="font-medium text-white mb-3">Recommendations</h3>
                      <div className="space-y-2">
                        {replayResult.insights.recommendations.map((rec, index) => (
                          <Alert key={index}>
                            <Zap className="h-4 w-4" />
                            <AlertDescription>{rec}</AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Security and Optimization Insights from Analysis */}
                  {replayResult.replayResult.analysis?.securityInsights?.length > 0 && (
                    <div>
                      <h3 className="font-medium text-white mb-3">Security Insights</h3>
                      <div className="space-y-2">
                        {replayResult.replayResult.analysis.securityInsights.map((insight, index) => (
                          <Alert key={index} className="border-yellow-400/50">
                            <AlertCircle className="h-4 w-4 text-yellow-400" />
                            <AlertDescription>{insight}</AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </div>
                  )}

                  {replayResult.replayResult.analysis?.optimizationSuggestions?.length > 0 && (
                    <div>
                      <h3 className="font-medium text-white mb-3">Optimization Suggestions</h3>
                      <div className="space-y-2">
                        {replayResult.replayResult.analysis.optimizationSuggestions.map((suggestion, index) => (
                          <Alert key={index} className="border-blue-400/50">
                            <Zap className="h-4 w-4 text-blue-400" />
                            <AlertDescription>{suggestion}</AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Performance Metrics */}
                  {replayResult.replayResult.analysis?.performanceMetrics && (
                    <div>
                      <h3 className="font-medium text-white mb-3">Performance Metrics</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-hyper-dark/50 p-3 rounded">
                          <span className="text-hyper-grey">Execution Time:</span>
                          <p className="font-mono">{replayResult.replayResult.analysis.performanceMetrics.executionTime}ms</p>
                        </div>
                        <div className="bg-hyper-dark/50 p-3 rounded">
                          <span className="text-hyper-grey">Network Calls:</span>
                          <p className="font-mono">{replayResult.replayResult.analysis.performanceMetrics.networkCalls}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}