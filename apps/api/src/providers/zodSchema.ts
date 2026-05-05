export type ZodDef = {
  typeName: string;
  innerType?: { _def: ZodDef };
  values?: string[];
  items?: { _def: ZodDef };
  shape?: () => Record<string, { _def: ZodDef }>;
};
