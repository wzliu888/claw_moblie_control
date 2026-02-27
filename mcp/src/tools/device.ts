import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { sendCommand } from '../mobile_client.js';

export const tools: Tool[] = [
  {
    name: 'battery',
    description: 'Get battery status (level, charging state, temperature).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'location',
    description: 'Get current GPS location (latitude, longitude, accuracy).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'network',
    description: 'Get network status (WiFi, mobile data, connection info).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'storage',
    description: 'Get storage usage (total, free, used).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'screen_state',
    description: 'Get screen state (on/off, locked).',
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function handle(name: string, args: any): Promise<string> {
  const result = await sendCommand(name, args);
  return JSON.stringify(result);
}
