export type CycleDependencies = {
  intents: (companyId: string) => unknown | Promise<unknown>;
  sales: (companyId: string) => unknown | Promise<unknown>;
  finance: (companyId: string) => Record<string, unknown> | Promise<Record<string, unknown>>;
  notifications: (companyId: string) => unknown | Promise<unknown>;
};

async function settle<T>(work: () => T | Promise<T>): Promise<PromiseSettledResult<T>> {
  try { return { status: "fulfilled", value: await work() }; }
  catch (reason) { return { status: "rejected", reason }; }
}

export async function runBusinessCycle(companyId: string, dependencies: CycleDependencies) {
  // Preserve causality: cross-chain settlement -> verified sale -> generated
  // obligations -> guarded finance action -> notification.
  const intents = await settle(() => dependencies.intents(companyId));
  const sales = await settle(() => dependencies.sales(companyId));
  const finance = await settle(() => dependencies.finance(companyId));
  const notifications = await settle(() => dependencies.notifications(companyId));
  if (finance.status === "rejected") throw finance.reason;
  return {
    ...finance.value,
    sales: sales.status === "fulfilled" ? sales.value : { error: "Sales reconciliation failed; retry on the next cycle" },
    intents: intents.status === "fulfilled" ? intents.value : { error: "Intents reconciliation failed; retry on the next cycle" },
    notifications: notifications.status === "fulfilled" ? notifications.value : { error: "Notification cycle failed; check delivery audit" },
  };
}
