# HyperEVM Transaction Simulation Platform

## Overview

This is a comprehensive transaction simulation platform specifically designed for HyperEVM, built as a full-stack web application. The platform enables developers to simulate blockchain transactions with 100% accuracy, providing detailed gas usage breakdowns, execution traces, and state change analysis. It serves as essential infrastructure for the HyperEVM ecosystem, supporting both individual transaction simulation and bundle testing capabilities.

The application features a React-based frontend with shadcn/ui components and a Node.js/Express backend with real-time WebSocket communication. It integrates directly with HyperEVM's dual-block architecture (fast and large blocks) and supports advanced simulation features like state overrides, account impersonation, and precompile interactions.

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
- **API Design**: RESTful endpoints with RPC-style simulation calls
- **Real-time Communication**: WebSocket server for live updates and notifications
- **Error Handling**: Centralized error middleware with structured responses

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
- **Transaction Processing**: Comprehensive transaction simulation with gas profiling
- **State Overrides**: Ability to modify contract storage, balances, and blockchain conditions
- **Bundle Simulation**: Support for chained, interdependent transaction testing
- **Execution Tracing**: Detailed step-by-step transaction execution analysis
- **Event Decoding**: Automatic decoding of smart contract events and logs

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