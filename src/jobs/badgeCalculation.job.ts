import { Badge } from "../models/Badge.model";
import { User } from "../models/User.model";
import { CheckinLog } from "../models/CheckinLog.model";
import { PlanProgress } from "../models/PlanProgress.model";
import { Offering } from "../models/Offering.model";

export interface BadgeProgress {
  badgeId: unknown;
  progress: number;
  earned: boolean;
}

// Lógica mínima (TDD "cálculo de badges/streak"): critérios sem taxonomia completa
// (fora de streak/check-ins/planos/ofertas) ficam com progress: 0 até serem mapeados aqui.
async function computeProgress(userId: string, criteriaType: string): Promise<number> {
  switch (criteriaType) {
    case "streak": {
      const user = await User.findById(userId).select("streak");
      return user?.streak ?? 0;
    }
    case "checkins":
      return CheckinLog.countDocuments({ userId });
    case "plans_completed":
      return PlanProgress.countDocuments({ userId, status: "completed" });
    case "offerings":
      return Offering.countDocuments({ userId, status: "paid" });
    default:
      return 0;
  }
}

// Recalcula o progresso de todas as badges do catálogo para um usuário e concede
// (User.badges, via $addToSet) as que atingiram a meta — idempotente, sem BullMQ/Redis por
// enquanto: não há ainda um evento assíncrono (ex.: check-in, conclusão de plano) que dispare
// esse cálculo em background, então é chamado diretamente por GET /badges/me.
export async function recalculateUserBadges(userId: string): Promise<BadgeProgress[]> {
  const [badges, user] = await Promise.all([Badge.find().sort({ _id: 1 }), User.findById(userId).select("badges")]);

  const earnedIds = new Set((user?.badges ?? []).map((id) => String(id)));
  const newlyEarnedIds: unknown[] = [];

  const results = await Promise.all(
    badges.map(async (badge) => {
      const progress = await computeProgress(userId, badge.criteria.type);
      const alreadyEarned = earnedIds.has(String(badge._id));
      const earned = alreadyEarned || progress >= badge.criteria.target;

      if (earned && !alreadyEarned) {
        newlyEarnedIds.push(badge._id);
      }

      return { badgeId: badge._id, progress, earned };
    }),
  );

  if (newlyEarnedIds.length > 0) {
    await User.updateOne({ _id: userId }, { $addToSet: { badges: { $each: newlyEarnedIds } } });
  }

  return results;
}
