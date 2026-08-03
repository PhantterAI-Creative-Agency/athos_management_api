import { User } from "../models/User.model";

type UserHydratedDocument = InstanceType<typeof User>;

/**
 * A user may manage another user's data (read/update cadastral fields) when the target
 * is their child, or their spouse's child — used to let parents/spouses keep a child's
 * profile (who may not have their own login) up to date. Restricted to the same church
 * to avoid a stale/cross-tenant familyData reference granting access.
 */
export async function isFamilyManager(requesterId: string, targetId: string): Promise<boolean> {
  if (requesterId === targetId) return false;

  const requester = await User.findById(requesterId).select("familyData churchId");
  if (!requester) return false;

  const target = await User.findById(targetId).select("churchId");
  if (!target || String(target.churchId) !== String(requester.churchId)) return false;

  const childrenIds = (requester.familyData?.childrenIds ?? []).map(String);
  if (childrenIds.includes(targetId)) return true;

  const spouseId = requester.familyData?.spouseId;
  if (!spouseId) return false;

  const spouse = await User.findById(spouseId).select("familyData");
  const spouseChildrenIds = (spouse?.familyData?.childrenIds ?? []).map(String);
  return spouseChildrenIds.includes(targetId);
}

export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasNotHadBirthdayThisYear =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());

  if (hasNotHadBirthdayThisYear) age -= 1;

  return age;
}

/**
 * Completes a spouse pre-registration (name + phone/email only) once a matching account
 * logs in or registers with that same phone/email — the pre-cadastro can only be finished
 * by the spouse themselves, never set directly by the pre-registering user.
 */
export async function tryLinkSpouse(user: UserHydratedDocument): Promise<void> {
  if (user.familyData?.spouseId) return;

  const email = user.email?.toLowerCase();
  const phone = user.phone;
  if (!email && !phone) return;

  const orConditions = [
    ...(email ? [{ "familyData.spousePending.email": email }] : []),
    ...(phone ? [{ "familyData.spousePending.phone": phone }] : []),
  ];

  const pendingHolder = await User.findOne({
    churchId: user.churchId,
    _id: { $ne: user._id },
    $or: orConditions,
  }).select("_id");

  if (!pendingHolder) return;

  await User.updateOne(
    { _id: pendingHolder._id },
    { $set: { "familyData.spouseId": user._id }, $unset: { "familyData.spousePending": 1 } },
  );
  await User.updateOne({ _id: user._id }, { $set: { "familyData.spouseId": pendingHolder._id } });

  user.set("familyData.spouseId", pendingHolder._id);
}
