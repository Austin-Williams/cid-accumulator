# Integration Workflow for OwnedExample

This directory contains scripts and documentation for integration testing with the OwnedExample contract on Sepolia.

## Prerequisites
- Node.js and npm installed
- .env file with:
  - `TARGET_CONTRACT_ADDRESS` (deployed contract address)
  - `RPC_PROVIDER_URL` (e.g., Sepolia endpoint)
  - `MNEMONIC_FOR_SUBMITTER` (account to send transactions)

## Scripts
- `submit-random-data.ts`: Submits random bytes to the contract and stores them locally for verification.

## Usage
1. Deploy `OwnedExample` to Sepolia and set the address in `.env`.
2. Run the script:
   ```sh
   npm run integration:submit
   ```
3. Check the output file for submitted data.
