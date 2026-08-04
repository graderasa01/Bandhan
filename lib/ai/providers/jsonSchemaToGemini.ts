import { SchemaType, type Schema } from "@google/generative-ai";

/**
 * Every structured-output schema in this codebase is plain JSON Schema
 * (written for Anthropic's `output_config.format`), but Gemini's
 * `responseSchema` is a distinct proto-based shape: `type` is always a single
 * `SchemaType` enum member (never `["string","null"]`), nullability is its
 * own `nullable: true` flag instead of a union, and there's no
 * `additionalProperties`. This converts one to the other so every prompt file
 * stays single-sourced instead of hand-duplicated per provider.
 */

type JsonSchemaNode = Record<string, unknown>;

function unwrapNullable(node: JsonSchemaNode): { node: JsonSchemaNode; nullable: boolean } {
  const type = node.type;
  if (Array.isArray(type)) {
    const nonNull = (type as string[]).filter((t) => t !== "null");
    return { node: { ...node, type: nonNull[0] }, nullable: nonNull.length !== type.length };
  }
  const anyOf = node.anyOf;
  if (Array.isArray(anyOf)) {
    const variants = anyOf as JsonSchemaNode[];
    const hasNull = variants.some((v) => v.type === "null");
    const nonNullVariant = variants.find((v) => v.type !== "null");
    if (hasNull && nonNullVariant) return { node: nonNullVariant, nullable: true };
  }
  return { node, nullable: false };
}

function convert(raw: JsonSchemaNode): JsonSchemaNode {
  const { node, nullable } = unwrapNullable(raw);
  const base: JsonSchemaNode = nullable ? { nullable: true } : {};

  switch (node.type) {
    case "object": {
      const rawProps = (node.properties as Record<string, JsonSchemaNode> | undefined) ?? {};
      const properties: Record<string, JsonSchemaNode> = {};
      for (const [key, value] of Object.entries(rawProps)) properties[key] = convert(value);
      return {
        ...base,
        type: SchemaType.OBJECT,
        properties,
        ...(node.required ? { required: node.required } : {}),
      };
    }
    case "array":
      return { ...base, type: SchemaType.ARRAY, items: convert((node.items as JsonSchemaNode) ?? { type: "string" }) };
    case "integer":
      return { ...base, type: SchemaType.INTEGER };
    case "number":
      return { ...base, type: SchemaType.NUMBER };
    case "boolean":
      return { ...base, type: SchemaType.BOOLEAN };
    case "string":
    default:
      return node.enum
        ? { ...base, type: SchemaType.STRING, format: "enum", enum: node.enum }
        : { ...base, type: SchemaType.STRING };
  }
}

export function jsonSchemaToGemini(schema: Record<string, unknown>): Schema {
  return convert(schema) as unknown as Schema;
}
