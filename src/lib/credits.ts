import { CreditTxType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS";
  constructor(public required: number, public available: number) {
    super(`Cette action nécessite ${required} crédits mais vous n'en avez que ${available}.`);
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Atomically deduct credits. Uses a conditional UPDATE so two concurrent
 * requests can never push the balance negative.
 */
export async function chargeCredits(
  userId: string,
  amount: number,
  type: CreditTxType,
  description: string,
  referenceId?: string,
  client: Tx | typeof prisma = prisma,
): Promise<number> {
  if (amount <= 0) throw new Error("Le montant du débit doit être positif");

  const run = async (tx: Tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, credits: { gte: amount } },
      data: { credits: { decrement: amount } },
    });
    if (updated.count === 0) {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
      throw new InsufficientCreditsError(amount, user.credits);
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
    await tx.creditTransaction.create({
      data: { userId, type, amount: -amount, balanceAfter: user.credits, description, referenceId },
    });
    return user.credits;
  };

  if ("$transaction" in client) return client.$transaction(run);
  return run(client as Tx);
}

export async function grantCredits(
  userId: string,
  amount: number,
  type: CreditTxType,
  description: string,
  referenceId?: string,
  client: Tx | typeof prisma = prisma,
): Promise<number> {
  if (amount <= 0) throw new Error("Le montant du crédit doit être positif");
  const run = async (tx: Tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount }, lifetimeCredits: { increment: amount } },
      select: { credits: true },
    });
    await tx.creditTransaction.create({
      data: { userId, type, amount, balanceAfter: user.credits, description, referenceId },
    });
    return user.credits;
  };
  if ("$transaction" in client) return client.$transaction(run);
  return run(client as Tx);
}

/** Reset the balance to the plan allowance (used on each paid invoice). */
export async function resetMonthlyCredits(userId: string, monthlyCredits: number, referenceId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
    const purchased = await tx.creditTransaction.aggregate({
      where: { userId, type: "PURCHASE" },
      _sum: { amount: true },
    });
    // Purchased credits never expire; subscription credits are replaced each cycle.
    const purchasedFloor = Math.min(current.credits, purchased._sum.amount ?? 0);
    const newBalance = purchasedFloor + monthlyCredits;
    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance, lifetimeCredits: { increment: monthlyCredits }, creditsResetAt: new Date() },
      select: { credits: true },
    });
    await tx.creditTransaction.create({
      data: {
        userId,
        type: "SUBSCRIPTION_GRANT",
        amount: monthlyCredits,
        balanceAfter: user.credits,
        description: `Crédits mensuels du forfait (${monthlyCredits})`,
        referenceId,
      },
    });
    return user.credits;
  });
}

export async function refundCredits(userId: string, amount: number, description: string, referenceId?: string) {
  return grantCredits(userId, amount, "REFUND", description, referenceId);
}

export async function getUsageSummary(userId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const rows = await prisma.creditTransaction.groupBy({
    by: ["type"],
    where: { userId, createdAt: { gte: since }, amount: { lt: 0 } },
    _sum: { amount: true },
    _count: true,
  });
  const byType = Object.fromEntries(rows.map((r) => [r.type, { credits: Math.abs(r._sum.amount ?? 0), count: r._count }]));
  const totalUsed = rows.reduce((acc, r) => acc + Math.abs(r._sum.amount ?? 0), 0);
  return { byType, totalUsed };
}
