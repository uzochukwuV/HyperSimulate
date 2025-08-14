# HyperEVM Transaction Simulation Platform

## Overview

This is a production-ready HyperEVM Transaction Simulation Platform built as a comprehensive full-stack web application. The platform provides 100% accurate transaction simulation with detailed gas analysis, execution tracing, and advanced state management. It serves as critical infrastructure for the HyperEVM ecosystem, supporting individual transactions, bundle simulations, and comprehensive analysis capabilities.

The application features a React-based frontend with shadcn/ui components and a robust Node.js/Express backend with real-time WebSocket communication. It integrates directly with HyperEVM's dual-block architecture (fast and large blocks) and supports advanced features including state overrides, bundle dependency analysis, security insights, and gas optimization recommendations.

## Recent Enhancements (Latest Update)

Based on comprehensive HyperEVM documentation, the platform has been significantly enhanced with:
- **Advanced Simulation Engine**: Full HyperEVM-specific precompile support and state management
- **Comprehensive Analysis**: Gas profiling, security insights, and optimization suggestions  
- **Bundle Simulation**: Transaction dependency analysis and bundle optimization
- **Enhanced API Layer**: JSON-RPC compatibility and advanced simulation endpoints
- **Performance Optimization**: LRU caching, simulation statistics, and performance monitoring

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom HyperEVM theme variables
- **State Management**: TanStack Query for server state, React hooks for local state
- **Routing**: Wouter for client-side routing
- **Real-time**: WebSocket integration for live simulation updates

### Backend Architecture
- **Runtime**: Node.js with Express framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with JSON-RPC compatibility for EVM integration
- **Real-time Communication**: WebSocket server for live updates and notifications
- **Error Handling**: Centralized error middleware with structured responses
- **Advanced Features**: LRU caching, performance monitoring, and comprehensive logging

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema**: Structured tables for users, simulations, system metrics, and API keys
- **Migration**: Drizzle Kit for database schema management
- **Connection**: Neon serverless PostgreSQL integration

### Authentication and Authorization
- **Session Management**: PostgreSQL-backed sessions with connect-pg-simple
- **API Keys**: Database-stored API keys for programmatic access
- **Rate Limiting**: Built-in rate limiting per API key (100 requests/minute default)

### HyperEVM Integration Architecture
- **RPC Communication**: Direct integration with HyperEVM mainnet and testnet RPC endpoints
- **Dual-Block Support**: Handles both fast blocks (1 second, 2M gas) and large blocks (60 seconds, higher gas limit)
- **Precompile Integration**: Support for HyperEVM-specific precompiles and system contracts
- **State Management**: Real-time blockchain state tracking and historical simulation capabilities

### Simulation Engine Design
- **Transaction Processing**: Comprehensive transaction simulation with gas profiling and analysis
- **State Overrides**: Ability to modify contract storage, balances, and blockchain conditions  
- **Bundle Simulation**: Support for chained, interdependent transaction testing with dependency analysis
- **Execution Tracing**: Detailed step-by-step transaction execution analysis
- **Event Decoding**: Automatic decoding of smart contract events and logs
- **Security Analysis**: Automated detection of potential security issues and optimization opportunities
- **Performance Monitoring**: Real-time performance metrics and caching for optimal response times

## Enhanced API Endpoints

### Core Simulation API
- `POST /api/v1/simulate` - Standard transaction simulation
- `POST /api/v1/simulate/advanced` - Enhanced simulation with state overrides
- `POST /api/v1/simulate/bundle` - Bundle simulation with dependency analysis
- `GET /api/v1/simulation/stats` - Simulation performance statistics
- `GET /api/v1/simulation/cache/:requestId` - Retrieve cached simulation results

### HyperEVM-Specific API
- `GET /api/v1/hyperevm/precompiles` - HyperEVM precompile information
- `POST /rpc` - JSON-RPC endpoint with HyperEVM extensions (eth_call, eth_estimateGas, hyperevm_simulate)

### Administrative API
- `POST /api/admin/cache/clear` - Clear simulation cache
- `GET /api/admin/health` - System health and connectivity status
- `GET /api/admin/metrics` - System performance metrics

### Real-time WebSocket Events
- `network_state` - Live blockchain state updates
- `simulation_complete` - Standard simulation completion
- `advanced_simulation_complete` - Enhanced simulation completion  
- `bundle_simulation_complete` - Bundle simulation completion

## External Dependencies

### Blockchain Integration
- **HyperEVM Network**: Direct RPC integration with mainnet (api.hyperliquid.xyz)
- **Hyperliquid API**: Integration with exchange and info endpoints for market data
- **Neon Database**: Serverless PostgreSQL hosting for production data storage

### Development Tools
- **Drizzle ORM**: Type-safe database operations and schema management
- **shadcn/ui**: Pre-built accessible UI components based on Radix UI
- **TanStack Query**: Server state management and caching
- **Vite**: Fast build tool and development server

### Runtime Services
- **WebSocket**: Real-time bidirectional communication for simulation updates
- **Express Session Store**: PostgreSQL-backed session persistence
- **CORS**: Cross-origin resource sharing for API access
- **Rate Limiting**: Request throttling and API key management

### UI/UX Libraries
- **Tailwind CSS**: Utility-first CSS framework with custom HyperEVM theming
- **Radix UI**: Accessible component primitives for complex UI patterns
- **Lucide React**: Icon library for consistent visual elements
- **React Hook Form**: Form validation and state management with Zod schemas