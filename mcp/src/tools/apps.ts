import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { sendAdb, sendCommand } from '../mobile_client.js';

export const tools: Tool[] = [
  {
    name: 'list_apps',
    description: 'List installed user (non-system) apps. Returns package name and label for each app.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'launch_app',
    description: 'Launch an app by package name.',
    inputSchema: {
      type: 'object',
      required: ['package'],
      properties: {
        package: { type: 'string', description: 'Android package name, e.g. com.taobao.taobao' },
      },
    },
  },
  {
    name: 'shell',
    description: 'Execute a shell command on the device. Use for advanced operations not covered by other tools.',
    inputSchema: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
    },
  },
];

export async function handle(name: string, args: any): Promise<any> {
  if (name === 'list_apps') {
    const result = await sendAdb('list_apps', {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }

  if (name === 'launch_app') {
    const result = await sendAdb('launch_app', { package: args.package });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }

  if (name === 'shell') {
    const result = await sendAdb('shell', { command: args.command });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }

  const result = await sendCommand(name, args);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
