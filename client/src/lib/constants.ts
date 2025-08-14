// HyperEVM Transaction Simulator Constants

export const APP_CONFIG = {
  name: "HyperEVM Simulator",
  version: "2.1.3",
  apiVersion: "v1.0",
} as const;

export const NETWORK_CONFIG = {
  chainId: "0x1", // HyperEVM mainnet
  networkName: "HyperEVM Mainnet",
  blockTime: 1000, // 1 second for fast blocks
  largeBlockTime: 60000, // 1 minute for large blocks
} as const;

export const GAS_LIMITS = {
  simple_transfer: 21000,
  erc20_transfer: 65000,
  contract_call: 200000,
  contract_deploy: 2000000,
  uniswap_swap: 300000,
} as const;

export const SIMULATION_MODES = {
  FAST: "fast",
  LARGE: "large",
} as const;

export const SIMULATION_STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  FAILED: "failed",
} as const;

export const PRECOMPILE_ADDRESSES = {
  READ_BASE: "0x0000000000000000000000000000000000000800",
  PERP_ORACLE: "0x0000000000000000000000000000000000000807",
  CORE_WRITER: "0x3333333333333333333333333333333333333333",
  HYPE_SYSTEM: "0x2222222222222222222222222222222222222222",
  WHYPE_CONTRACT: "0x5555555555555555555555555555555555555555",
} as const;

export const TRANSACTION_TEMPLATES = {
  ERC20_TRANSFER: {
    name: "ERC20 Transfer",
    data: "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    gasLimit: GAS_LIMITS.erc20_transfer.toString(),
    description: "Standard ERC20 token transfer",
  },
  ETH_TRANSFER: {
    name: "ETH Transfer",
    data: "0x",
    gasLimit: GAS_LIMITS.simple_transfer.toString(),
    description: "Simple ETH transfer",
  },
  CONTRACT_DEPLOY: {
    name: "Contract Deploy",
    to: "",
    gasLimit: GAS_LIMITS.contract_deploy.toString(),
    description: "Deploy a new smart contract",
  },
  UNISWAP_SWAP: {
    name: "Uniswap Swap",
    gasLimit: GAS_LIMITS.uniswap_swap.toString(),
    description: "Execute a Uniswap token swap",
  },
} as const;

export const API_ENDPOINTS = {
  SIMULATE: "/api/v1/simulate",
  GAS_ESTIMATE: "/api/v1/gas-estimate",
  BUNDLE_SIMULATE: "/api/v1/bundle-simulate",
  RECENT_SIMULATIONS: "/api/simulations/recent",
  SIMULATION_BY_ID: "/api/simulations",
  ADMIN_METRICS: "/api/admin/metrics",
  ADMIN_HEALTH: "/api/admin/health",
  NETWORK_STATE: "/api/network/state",
} as const;

export const WEBSOCKET_EVENTS = {
  NETWORK_STATE: "network_state",
  SIMULATION_COMPLETE: "simulation_complete",
  SYSTEM_ALERT: "system_alert",
  METRICS_UPDATE: "metrics_update",
} as const;

export const POLLING_INTERVALS = {
  NETWORK_STATE: 30000, // 30 seconds
  METRICS: 60000, // 1 minute
  RECENT_SIMULATIONS: 15000, // 15 seconds
  HEALTH_CHECK: 30000, // 30 seconds
} as const;

export const RATE_LIMITS = {
  SIMULATE: 100, // per minute
  GAS_ESTIMATE: 1000, // per minute
  BUNDLE_SIMULATE: 50, // per minute
} as const;

export const ERROR_MESSAGES = {
  INVALID_ADDRESS: "Invalid Ethereum address format",
  INVALID_HEX_DATA: "Invalid hexadecimal data format",
  NETWORK_ERROR: "Network connection failed",
  SIMULATION_FAILED: "Transaction simulation failed",
  GAS_ESTIMATION_FAILED: "Gas estimation failed",
  WEBSOCKET_CONNECTION_FAILED: "Real-time connection failed",
  API_RATE_LIMIT: "API rate limit exceeded",
} as const;

export const SUCCESS_MESSAGES = {
  SIMULATION_COMPLETE: "Transaction simulation completed successfully",
  GAS_ESTIMATED: "Gas limit estimated successfully",
  CONNECTION_ESTABLISHED: "Real-time connection established",
} as const;

export const TRACE_TYPES = {
  CALL: "CALL",
  RETURN: "RETURN",
  REVERT: "REVERT",
  CREATE: "CREATE",
  CREATE2: "CREATE2",
} as const;

export const SYSTEM_ALERT_TYPES = {
  HIGH_GAS_PRICE: "high_gas_price",
  RATE_LIMIT_WARNING: "rate_limit_warning",
  SYSTEM_UPDATE: "system_update",
  SERVICE_DEGRADATION: "service_degradation",
} as const;

// Color theme constants matching the design
export const THEME_COLORS = {
  HYPER_DARK: "#1B1B1F",
  HYPER_TEAL: "#00D4AA",
  HYPER_RED: "#FF6B6B",
  HYPER_GREEN: "#4ECDC4",
  HYPER_GREY: "#8B8B8B",
  HYPER_DARK_LIGHTER: "#2A2A2F",
  HYPER_DARK_BORDER: "#3A3A3F",
} as const;

export const NAVIGATION_ITEMS = [
  {
    id: "transaction-builder",
    label: "Transaction Builder",
    section: "SIMULATION",
    description: "Build and simulate individual transactions",
  },
  {
    id: "simulation-history",
    label: "Simulation History",
    section: "SIMULATION",
    description: "View past simulation results",
  },
  {
    id: "bundle-simulator",
    label: "Bundle Simulator",
    section: "SIMULATION",
    description: "Simulate transaction bundles",
  },
  {
    id: "gas-profiler",
    label: "Gas Profiler",
    section: "ANALYSIS",
    description: "Analyze gas usage patterns",
  },
  {
    id: "event-decoder",
    label: "Event Decoder",
    section: "ANALYSIS",
    description: "Decode transaction events and logs",
  },
  {
    id: "state-inspector",
    label: "State Inspector",
    section: "ANALYSIS",
    description: "Inspect blockchain state changes",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    section: "ADMIN",
    description: "System performance overview",
  },
  {
    id: "system-health",
    label: "System Health",
    section: "ADMIN",
    description: "Monitor system health and API status",
  },
  {
    id: "configuration",
    label: "Configuration",
    section: "ADMIN",
    description: "System configuration settings",
  },
] as const;

export const FORM_VALIDATION = {
  ADDRESS_REGEX: /^0x[a-fA-F0-9]{40}$/,
  HEX_DATA_REGEX: /^(0x[a-fA-F0-9]*)?$/,
  REQUIRED_FIELDS: {
    FROM_ADDRESS: "From address is required",
    TO_ADDRESS: "To address is required for contract calls",
    GAS_LIMIT: "Gas limit is required",
  },
} as const;
