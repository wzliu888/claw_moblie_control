import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { sendCommand } from '../mobile_client.js';

export const tools: Tool[] = [
  {
    name: 'camera_snap',
    description: 'Take a photo with the device camera. Returns a JPEG image. Requires camera permission granted in the app.',
    inputSchema: {
      type: 'object',
      properties: {
        camera:  { type: 'string', enum: ['back', 'front'], description: 'Which camera to use. Default: back.' },
        quality: { type: 'number', description: 'JPEG quality 1-100. Default: 80.' },
      },
    },
  },
  {
    name: 'audio_record',
    description: 'Record audio from the microphone. Use action=capture for a one-shot recording, or start/stop for manual control. Returns base64 audio data on stop/capture.',
    inputSchema: {
      type: 'object',
      properties: {
        action:   { type: 'string', enum: ['capture', 'start', 'stop'], description: 'capture=record+return, start=begin recording, stop=end+return audio. Default: capture.' },
        duration: { type: 'number', description: 'Recording duration in seconds for capture action. Default: 5, max: 60.' },
        format:   { type: 'string', enum: ['m4a', '3gp'], description: 'Audio format. Default: m4a.' },
      },
    },
  },
  {
    name: 'audio_status',
    description: 'Check if audio recording is currently in progress.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'sensors',
    description: 'Read device sensor data. Omit type to get all sensors, or specify one.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['accelerometer', 'gyroscope', 'magnetometer', 'light', 'proximity', 'pressure', 'gravity', 'rotation'],
          description: 'Sensor type. Omit to read all sensors.',
        },
      },
    },
  },
];

export async function handle(name: string, args: any): Promise<any> {
  if (name === 'camera_snap') {
    const result = await sendCommand('camera_snap', args);
    // Return as MCP image block if we got image data
    if (result.success && result.data?.image) {
      return {
        content: [{
          type: 'image',
          data: result.data.image,
          mimeType: result.data.mimeType ?? 'image/jpeg',
        }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.success };
  }

  const result = await sendCommand(name, args);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
