import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const simulations = pgTable("simulations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  transactionData: jsonb("transaction_data").notNull(),
  simulationResults: jsonb("simulation_results"),
  status: text("status").notNull().default("pending"), // pending, success, failed
  gasUsed: integer("gas_used"),
  gasLimit: integer("gas_limit"),
  executionTime: integer("execution_time"), // in milliseconds
  blockNumber: text("block_number"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const systemMetrics = pgTable("system_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricType: text("metric_type").notNull(), // total_simulations, success_rate, avg_response_time, api_requests
  value: text("value").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  keyName: text("key_name").notNull(),
  keyValue: text("key_value").notNull(),
  isActive: boolean("is_active").default(true),
  rateLimit: integer("rate_limit").default(100), // requests per minute
  createdAt: timestamp("created_at").defaultNow(),
});

// Transaction data schema for simulation requests
export const transactionSchema = z.object({
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address format"),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address format").optional(),
  value: z.string().default("0"),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, "Invalid hex data").optional(),
  gasLimit: z.string().default("21000"),
  gasPrice: z.string().optional(),
  nonce: z.string().optional(),
});

export const simulationRequestSchema = z.object({
  transaction: transactionSchema,
  blockNumber: z.string().default("latest"),
  enableStateOverrides: z.boolean().optional(),
  simulationMode: z.enum(["fast", "large"]).default("fast"),
  includePrecompiles: z.boolean().optional(),
  simulateCoreWriter: z.boolean().default(false),
  // Step 2: Add executionMode to schema
  executionMode: z.enum(["rpc", "local", "hybrid"]).default("rpc"),
});

export const bundleSimulationSchema = z.object({
  transactions: z.array(transactionSchema),
  blockNumber: z.string().default("latest"),
  enableStateOverrides: z.boolean().default(false),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSimulationSchema = createInsertSchema(simulations).omit({
  id: true,
  createdAt: true,
});

export const insertSystemMetricSchema = createInsertSchema(systemMetrics).omit({
  id: true,
  timestamp: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Simulation = typeof simulations.$inferSelect;
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;

export type SystemMetric = typeof systemMetrics.$inferSelect;
export type InsertSystemMetric = z.infer<typeof insertSystemMetricSchema>;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type TransactionData = z.infer<typeof transactionSchema>;
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;
export type BundleSimulationRequest = z.infer<typeof bundleSimulationSchema>;

// Simulation result types
export interface ExecutionTrace {
  type: "CALL" | "RETURN" | "REVERT" | "CREATE";
  depth: number;
  from?: string;
  to?: string;
  value?: string;
  gasUsed: number;
  gasRemaining: number;
  output?: string;
  error?: string;
}

export interface StateChange {
  address: string;
  slot: string;
  previousValue: string;
  newValue: string;
}

export interface EventLog {
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
}

export interface SimulationResult {
  success: boolean;
  gasUsed: number;
  gasLimit: number;
  transactionFee: string;
  executionTrace: ExecutionTrace[];
  stateChanges: StateChange[];
  events: EventLog[];
  gasBreakdown: {
    intrinsicGas: number;
    executionGas: number;
    storageGas: number;
    memoryGas: number;
  };
  errorMessage?: string;
  returnValue?: string;
}
