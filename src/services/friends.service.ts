import { Friendship } from "../models/Friendship.model";
import { User } from "../models/User.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type { CreateFriendshipDTO, FriendshipDTO, ListFriendsQueryDTO } from "../interfaces/friend.interface";

type FriendshipDocumentLike = {
  _id: unknown;
  userId: unknown;
  friendId: unknown;
  status: "suggested" | "pending" | "accepted";
  mutualFriendsCount: number;
  createdAt: Date;
};

function toFriendshipDTO(friendship: FriendshipDocumentLike): FriendshipDTO {
  return {
    id: String(friendship._id),
    userId: String(friendship.userId),
    friendId: String(friendship.friendId),
    status: friendship.status,
    mutualFriendsCount: friendship.mutualFriendsCount,
    createdAt: friendship.createdAt.toISOString(),
  };
}

async function getAcceptedFriendIds(userId: string): Promise<Set<string>> {
  const friendships = await Friendship.find({
    status: "accepted",
    $or: [{ userId }, { friendId: userId }],
  });

  return new Set(
    friendships.map((friendship) =>
      String(friendship.userId) === userId ? String(friendship.friendId) : String(friendship.userId),
    ),
  );
}

async function findFriendshipParticipant(requester: AuthTokenPayload, friendshipId: string) {
  const friendship = await Friendship.findById(friendshipId);

  if (!friendship) {
    throw new AppError(404, "FRIENDSHIP_NOT_FOUND", "Solicitação de amizade não encontrada");
  }

  const isParticipant =
    String(friendship.userId) === requester.sub || String(friendship.friendId) === requester.sub;

  if (!isParticipant) {
    throw new AppError(403, "FORBIDDEN", "Você não faz parte desta solicitação de amizade");
  }

  return friendship;
}

export async function createFriendRequest(
  requester: AuthTokenPayload,
  data: CreateFriendshipDTO,
): Promise<FriendshipDTO> {
  if (data.friendId === requester.sub) {
    throw new AppError(400, "CANNOT_FRIEND_SELF", "Não é possível enviar uma solicitação de amizade para si mesmo");
  }

  const friend = await User.findOne({ _id: data.friendId, churchId: requester.churchId });

  if (!friend) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  const existing = await Friendship.findOne({
    $or: [
      { userId: requester.sub, friendId: data.friendId },
      { userId: data.friendId, friendId: requester.sub },
    ],
  });

  if (existing) {
    throw new AppError(409, "FRIENDSHIP_ALREADY_EXISTS", "Já existe uma amizade ou solicitação entre esses usuários");
  }

  const friendship = await Friendship.create({
    userId: requester.sub,
    friendId: data.friendId,
    status: "pending",
  });

  return toFriendshipDTO(friendship);
}

export async function listFriendships(
  requester: AuthTokenPayload,
  status?: ListFriendsQueryDTO["status"],
): Promise<FriendshipDTO[]> {
  const filter: Record<string, unknown> = {
    $or: [{ userId: requester.sub }, { friendId: requester.sub }],
  };

  if (status) {
    filter.status = status;
  }

  const friendships = await Friendship.find(filter).sort({ createdAt: -1 });

  return friendships.map(toFriendshipDTO);
}

export async function acceptFriendRequest(
  requester: AuthTokenPayload,
  friendshipId: string,
): Promise<FriendshipDTO> {
  const friendship = await findFriendshipParticipant(requester, friendshipId);

  if (String(friendship.friendId) !== requester.sub) {
    throw new AppError(403, "FORBIDDEN", "Apenas quem recebeu a solicitação pode aceitá-la");
  }

  if (friendship.status !== "pending") {
    throw new AppError(409, "FRIENDSHIP_INVALID_STATUS", "Esta solicitação já foi respondida");
  }

  const [userFriendIds, friendFriendIds] = await Promise.all([
    getAcceptedFriendIds(String(friendship.userId)),
    getAcceptedFriendIds(String(friendship.friendId)),
  ]);

  let mutualCount = 0;
  for (const id of userFriendIds) {
    if (friendFriendIds.has(id)) mutualCount += 1;
  }

  friendship.status = "accepted";
  friendship.mutualFriendsCount = mutualCount;
  await friendship.save();

  await User.findByIdAndUpdate(friendship.userId, { $inc: { friendsCount: 1 } });
  await User.findByIdAndUpdate(friendship.friendId, { $inc: { friendsCount: 1 } });

  return toFriendshipDTO(friendship);
}

export async function deleteFriendship(requester: AuthTokenPayload, friendshipId: string): Promise<void> {
  const friendship = await findFriendshipParticipant(requester, friendshipId);

  if (friendship.status === "accepted") {
    await User.findByIdAndUpdate(friendship.userId, { $inc: { friendsCount: -1 } });
    await User.findByIdAndUpdate(friendship.friendId, { $inc: { friendsCount: -1 } });
  }

  await friendship.deleteOne();
}
