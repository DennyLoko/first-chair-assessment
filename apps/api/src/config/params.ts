import { AdminParamsSchema, type AdminParams } from '@first-chair/shared';

const defaults: AdminParams = AdminParamsSchema.parse({});

let current: AdminParams = { ...defaults };

export function getParams(): Readonly<AdminParams> {
  return current;
}

export function setParams(patch: Partial<AdminParams>): AdminParams {
  current = AdminParamsSchema.parse({ ...current, ...patch });
  return current;
}

export function resetParams(): AdminParams {
  current = { ...defaults };
  return current;
}
