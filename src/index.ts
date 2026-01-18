#!/usr/bin/env node
import { ObsidianMcpServer } from './server.js';

const server = new ObsidianMcpServer();
server.run().catch(console.error);
