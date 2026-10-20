import { z } from 'zod';
import { ITool } from './types.js';

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function zodToJsonSchema(schema: z.ZodType<any>): Record<string, unknown> {
  if (!schema || !(schema as any)._def) {
    return { type: 'object', properties: {} };
  }
  const def = (schema as any)._def;

  if (def.typeName === 'ZodRecord') {
    return { type: 'object', additionalProperties: true };
  }

  if (def.typeName === 'ZodObject' || (schema as any).shape) {
    const shape =
      typeof (schema as any).shape === 'function'
        ? (schema as any).shape()
        : (schema as any).shape || (def.shape ? def.shape() : {});
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, propSchema] of Object.entries(shape as Record<string, any>)) {
      const propDef = propSchema._def || {};
      let type = 'string';
      let isOptional = false;

      let current = propDef;
      while (current.innerType) {
        if (current.typeName === 'ZodOptional' || current.typeName === 'ZodDefault') {
          isOptional = true;
        }
        current = current.innerType._def || {};
      }

      if (current.typeName === 'ZodString') type = 'string';
      else if (current.typeName === 'ZodNumber') type = 'number';
      else if (current.typeName === 'ZodBoolean') type = 'boolean';
      else if (current.typeName === 'ZodArray') type = 'array';
      else if (current.typeName === 'ZodObject') type = 'object';

      properties[key] = {
        type,
        description: current.description || propDef.description || key,
      };

      if (!isOptional && propDef.typeName !== 'ZodOptional' && propDef.typeName !== 'ZodDefault') {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: 'object', properties: {} };
}

export function toolToDeclaration(tool: ITool<any, any>): ToolDeclaration {
  if ((tool as any).mcpTool?.inputSchema) {
    return {
      name: tool.name,
      description: tool.description,
      parameters: (tool as any).mcpTool.inputSchema,
    };
  }

  return {
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.inputSchema),
  };
}
