import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Play, Upload, Edit, Sliders } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const transactionFormSchema = z.object({
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address format"),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address format").optional().or(z.literal("")),
  value: z.string().default("0"),
  data: z.string().regex(/^(0x[a-fA-F0-9]*)?$/, "Invalid hex data").optional(),
  gasLimit: z.string().default("21000"),
  blockNumber: z.string().default("latest"),
  simulationMode: z.enum(["fast", "large"]).default("fast"),
  enableStateOverrides: z.boolean().default(false),
  includePrecompiles: z.boolean().default(false),
  simulateCoreWriter: z.boolean().default(false),
});

type TransactionForm = z.infer<typeof transactionFormSchema>;

interface TransactionBuilderProps {
  onSimulationComplete: (result: any) => void;
}

export default function TransactionBuilder({ onSimulationComplete }: TransactionBuilderProps) {
  const { toast } = useToast();
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);

  const form = useForm<TransactionForm>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      from: "",
      to: "",
      value: "0",
      data: "",
      gasLimit: "21000",
      blockNumber: "latest",
      simulationMode: "fast",
      enableStateOverrides: false,
      includePrecompiles: false,
      simulateCoreWriter: false,
    },
  });

  // Gas estimation query
  const { data: gasEstimate, refetch: refetchGasEstimate } = useQuery({
    queryKey: ["/api/v1/gas-estimate"],
    enabled: false,
  });

  const simulationMutation = useMutation({
    mutationFn: async (data: TransactionForm) => {
      const response = await apiRequest("POST", "/api/v1/simulate", {
        transaction: {
          from: data.from,
          to: data.to || undefined,
          value: data.value,
          data: data.data || undefined,
          gasLimit: data.gasLimit,
        },
        blockNumber: data.blockNumber,
        enableStateOverrides: data.enableStateOverrides,
        simulationMode: data.simulationMode,
        includePrecompiles: data.includePrecompiles,
        simulateCoreWriter: data.simulateCoreWriter,
      });
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Simulation Complete",
        description: `Transaction ${result.result.success ? 'succeeded' : 'failed'} with ${result.result.gasUsed} gas used`,
      });
      onSimulationComplete(result);
    },
    onError: (error) => {
      toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TransactionForm) => {
    simulationMutation.mutate(data);
  };

  const estimateGas = async () => {
    const formData = form.getValues();
    if (!formData.from || !formData.to) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in From and To addresses to estimate gas",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/v1/gas-estimate", {
        from: formData.from,
        to: formData.to,
        value: formData.value,
        data: formData.data,
      });
      const estimate = await response.json();
      
      const gasLimit = parseInt(estimate.gasLimit, 16);
      form.setValue("gasLimit", gasLimit.toString());
      
      toast({
        title: "Gas Estimated",
        description: `Estimated gas limit: ${gasLimit.toLocaleString()}`,
      });
    } catch (error) {
      toast({
        title: "Gas Estimation Failed",
        description: "Could not estimate gas for this transaction",
        variant: "destructive",
      });
    }
  };

  const loadQuickTemplate = (template: string) => {
    switch (template) {
      case "erc20":
        form.setValue("data", "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000");
        form.setValue("gasLimit", "65000");
        break;
      case "uniswap":
        form.setValue("gasLimit", "200000");
        break;
      case "deploy":
        form.setValue("to", "");
        form.setValue("gasLimit", "2000000");
        break;
      case "oracle_read":
        form.setValue("to", "0x0000000000000000000000000000000000000807");
        form.setValue("data", "0x0000000000000000000000000000000000000000000000000000000000000000"); // Asset index 0
        form.setValue("gasLimit", "2100"); // 2000 + 65 * output_len
        form.setValue("value", "0");
        break;
      case "core_writer":
        form.setValue("to", "0x3333333333333333333333333333333333333333");
        form.setValue("data", "0x01000001"); // Simplified CoreWriter action
        form.setValue("gasLimit", "47000");
        form.setValue("value", "0");
        break;
      case "hype_transfer":
        form.setValue("to", "0x2222222222222222222222222222222222222222");
        form.setValue("gasLimit", "21000");
        form.setValue("value", "1000000000000000000"); // 1 HYPE
        break;
      case "perp_positions":
        form.setValue("to", "0x0000000000000000000000000000000000000801");
        form.setValue("data", "0x742d35cc6634c0532925a3b8d40c6f25a8b8d40c6f25a8b8d40c6f25a8b8d40c"); // User address
        form.setValue("gasLimit", "2100");
        form.setValue("value", "0");
        break;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold" data-testid="title-transaction-builder">Transaction Builder</h2>
        <div className="flex items-center space-x-3">
          <Button variant="outline" className="border-hyper-dark-border hover:border-hyper-teal" data-testid="button-load-json">
            <Upload className="w-4 h-4 mr-2" />
            Load from JSON
          </Button>
          <Button 
            onClick={form.handleSubmit(onSubmit)}
            disabled={simulationMutation.isPending}
            className="bg-hyper-teal text-hyper-dark hover:bg-hyper-teal/90 font-medium"
            data-testid="button-simulate-transaction"
          >
            <Play className="w-4 h-4 mr-2" />
            {simulationMutation.isPending ? "Simulating..." : "Simulate Transaction"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transaction Form */}
        <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Edit className="w-5 h-5 text-hyper-teal mr-2" />
              Transaction Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="from" className="text-sm font-medium text-hyper-grey">From Address</Label>
                <Input
                  id="from"
                  {...form.register("from")}
                  placeholder="0x742d35Cc6634C0532925a3b8D5c..."
                  className="font-mono text-sm"
                  data-testid="input-from-address"
                />
                {form.formState.errors.from && (
                  <p className="text-hyper-red text-xs mt-1">{form.formState.errors.from.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="to" className="text-sm font-medium text-hyper-grey">To Address</Label>
                <Input
                  id="to"
                  {...form.register("to")}
                  placeholder="0x1234567890abcdef1234567890..."
                  className="font-mono text-sm"
                  data-testid="input-to-address"
                />
                {form.formState.errors.to && (
                  <p className="text-hyper-red text-xs mt-1">{form.formState.errors.to.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="value" className="text-sm font-medium text-hyper-grey">Value (ETH)</Label>
                <Input
                  id="value"
                  {...form.register("value")}
                  placeholder="0.0"
                  className="font-mono text-sm"
                  data-testid="input-value"
                />
              </div>
              <div>
                <Label htmlFor="gasLimit" className="text-sm font-medium text-hyper-grey">Gas Limit</Label>
                <div className="flex space-x-2">
                  <Input
                    id="gasLimit"
                    {...form.register("gasLimit")}
                    placeholder="21000"
                    className="font-mono text-sm"
                    data-testid="input-gas-limit"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={estimateGas}
                    className="border-hyper-dark-border hover:border-hyper-teal"
                    data-testid="button-estimate-gas"
                  >
                    Estimate
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="data" className="text-sm font-medium text-hyper-grey">Transaction Data (Hex)</Label>
              <Textarea
                id="data"
                {...form.register("data")}
                placeholder="0x..."
                className="font-mono text-sm h-24 resize-none"
                data-testid="textarea-transaction-data"
              />
              {form.formState.errors.data && (
                <p className="text-hyper-red text-xs mt-1">{form.formState.errors.data.message}</p>
              )}
            </div>

            <div className="border-t border-hyper-dark-border pt-4">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="enableStateOverrides"
                  checked={form.watch("enableStateOverrides")}
                  onCheckedChange={(checked) => form.setValue("enableStateOverrides", !!checked)}
                  data-testid="checkbox-state-overrides"
                />
                <Label htmlFor="enableStateOverrides" className="text-sm text-hyper-grey">
                  Enable State Overrides
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Options */}
        <Card className="bg-hyper-dark-lighter border-hyper-dark-border">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Sliders className="w-5 h-5 text-hyper-teal mr-2" />
              Advanced Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-hyper-grey">Block Number</Label>
              <Select 
                value={form.watch("blockNumber")} 
                onValueChange={(value) => form.setValue("blockNumber", value)}
              >
                <SelectTrigger data-testid="select-block-number">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest Block</SelectItem>
                  <SelectItem value="pending">Pending Block</SelectItem>
                  <SelectItem value="custom">Custom Block...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium text-hyper-grey">Simulation Mode</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  type="button"
                  variant={form.watch("simulationMode") === "fast" ? "default" : "outline"}
                  className={form.watch("simulationMode") === "fast" 
                    ? "bg-hyper-teal text-hyper-dark" 
                    : "border-hyper-dark-border hover:border-hyper-teal"
                  }
                  onClick={() => form.setValue("simulationMode", "fast")}
                  data-testid="button-fast-block"
                >
                  Fast Block
                </Button>
                <Button
                  type="button"
                  variant={form.watch("simulationMode") === "large" ? "default" : "outline"}
                  className={form.watch("simulationMode") === "large" 
                    ? "bg-hyper-teal text-hyper-dark" 
                    : "border-hyper-dark-border hover:border-hyper-teal"
                  }
                  onClick={() => form.setValue("simulationMode", "large")}
                  data-testid="button-large-block"
                >
                  Large Block
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-hyper-grey">HyperCore Integration</Label>
              <div className="space-y-2 mt-2">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="includePrecompiles"
                    checked={form.watch("includePrecompiles")}
                    onCheckedChange={(checked) => form.setValue("includePrecompiles", !!checked)}
                    data-testid="checkbox-precompiles"
                  />
                  <Label htmlFor="includePrecompiles" className="text-sm text-hyper-grey">
                    Include precompile calls
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="simulateCoreWriter"
                    checked={form.watch("simulateCoreWriter")}
                    onCheckedChange={(checked) => form.setValue("simulateCoreWriter", !!checked)}
                    data-testid="checkbox-core-writer"
                  />
                  <Label htmlFor="simulateCoreWriter" className="text-sm text-hyper-grey">
                    Simulate CoreWriter actions
                  </Label>
                </div>
              </div>
            </div>

            <Card className="bg-hyper-dark border-hyper-dark-border">
              <CardContent className="p-4">
                <h4 className="text-sm font-medium text-hyper-grey mb-3">Quick Actions</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadQuickTemplate("erc20")}
                    className="border-hyper-dark-border hover:border-hyper-teal text-xs"
                    data-testid="button-template-erc20"
                  >
                    ERC20 Transfer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadQuickTemplate("deploy")}
                    className="border-hyper-dark-border hover:border-hyper-teal text-xs"
                    data-testid="button-template-deploy"
                  >
                    Contract Deploy
                  </Button>
                </div>
                
                <h4 className="text-sm font-medium text-hyper-teal mb-3">HyperEVM Precompiles</h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadQuickTemplate("oracle_read")}
                    className="border-hyper-teal hover:bg-hyper-teal hover:text-hyper-dark text-xs"
                    data-testid="button-template-oracle"
                  >
                    📊 Oracle Price
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadQuickTemplate("core_writer")}
                    className="border-hyper-teal hover:bg-hyper-teal hover:text-hyper-dark text-xs"
                    data-testid="button-template-corewriter"
                  >
                    ✍️ CoreWriter
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadQuickTemplate("hype_transfer")}
                    className="border-hyper-teal hover:bg-hyper-teal hover:text-hyper-dark text-xs"
                    data-testid="button-template-hype"
                  >
                    💰 HYPE Transfer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadQuickTemplate("perp_positions")}
                    className="border-hyper-teal hover:bg-hyper-teal hover:text-hyper-dark text-xs"
                    data-testid="button-template-perp"
                  >
                    📈 Perp Positions
                  </Button>
                </div>

                <div className="text-xs text-hyper-grey mt-2 p-2 bg-hyper-dark-lighter rounded border border-hyper-dark-border">
                  <strong>💡 Pro Tip:</strong> HyperEVM precompiles have specific gas costs:
                  <ul className="mt-1 space-y-1">
                    <li>• Oracle reads: 2000 + 65 × output_len gas</li>
                    <li>• CoreWriter: ~47,000 gas + 3sec delay</li>
                    <li>• HYPE transfers: 21,000 gas</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
