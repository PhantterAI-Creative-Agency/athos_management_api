import { Church } from "../models/Church.model";
import { User } from "../models/User.model";
import { hashPassword } from "../helpers/password.helper";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { calculateAge, isFamilyManager, tryLinkSpouse } from "../helpers/family.helper";
import { AppError } from "../middlewares/errorHandler";
import type { CreateChildDTO, CreateUserDTO, UpdateUserDTO, UserDTO } from "../interfaces/user.interface";

type UserDocumentLike = {
  _id: unknown;
  churchId: unknown;
  name: string;
  email?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  birthDate?: Date | null;
  roles: string[];
  active: boolean;
  professionalData?: { company?: string | null; role?: string | null } | null;
  familyData?: {
    spouseId?: unknown;
    childrenIds?: unknown[];
    spousePending?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  } | null;
  vehicles?: { plate: string; model: string }[] | null;
  medicalRecord?: { bloodType?: string | null; allergies?: string[] } | null;
  createdAt: Date;
  updatedAt: Date;
};

function toUserDTO(user: UserDocumentLike): UserDTO {
  return {
    id: String(user._id),
    churchId: String(user.churchId),
    name: user.name,
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    photoUrl: user.photoUrl ?? undefined,
    bio: user.bio ?? undefined,
    birthDate: user.birthDate ? user.birthDate.toISOString() : undefined,
    roles: user.roles as UserDTO["roles"],
    active: user.active,
    professionalData: user.professionalData
      ? { company: user.professionalData.company ?? undefined, role: user.professionalData.role ?? undefined }
      : undefined,
    familyData: user.familyData
      ? {
          spouseId: user.familyData.spouseId ? String(user.familyData.spouseId) : undefined,
          childrenIds: user.familyData.childrenIds?.map((id) => String(id)),
          spousePending: user.familyData.spousePending
            ? {
                name: user.familyData.spousePending.name ?? "",
                phone: user.familyData.spousePending.phone ?? undefined,
                email: user.familyData.spousePending.email ?? undefined,
              }
            : undefined,
        }
      : undefined,
    vehicles: user.vehicles ?? undefined,
    medicalRecord: user.medicalRecord
      ? { bloodType: user.medicalRecord.bloodType ?? undefined, allergies: user.medicalRecord.allergies }
      : undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function isAdminOf(requester: AuthTokenPayload, targetChurchId: string): boolean {
  return isDevAdmin(requester) || (requester.roles.includes("admin") && requester.churchId === targetChurchId);
}

export async function createUser(data: CreateUserDTO): Promise<UserDTO> {
  const church = await Church.findById(data.churchId);

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  const existing = await User.findOne({ email: data.email.toLowerCase() });

  if (existing) {
    throw new AppError(409, "EMAIL_ALREADY_EXISTS", "E-mail já cadastrado");
  }

  const passwordHash = await hashPassword(data.password);

  const user = await User.create({
    churchId: data.churchId,
    name: data.name,
    email: data.email.toLowerCase(),
    passwordHash,
    phone: data.phone,
    roles: ["visitor"],
  });

  await tryLinkSpouse(user);

  return toUserDTO(user);
}

export async function createChild(
  requester: AuthTokenPayload,
  parentId: string,
  data: CreateChildDTO,
): Promise<UserDTO> {
  const parent = await User.findById(parentId);

  if (!parent) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  const isSelf = String(parent._id) === requester.sub;
  const isAdmin = isAdminOf(requester, String(parent.churchId));

  if (!isSelf && !isAdmin) {
    throw new AppError(403, "FORBIDDEN", "Apenas o próprio responsável ou um administrador podem cadastrar filhos");
  }

  const birthDate = new Date(data.birthDate);
  const age = calculateAge(birthDate);

  if (age < 13 && (data.email || data.password)) {
    throw new AppError(
      400,
      "CHILD_LOGIN_NOT_ALLOWED",
      "Login não é permitido para filhos menores de 13 anos",
    );
  }

  if (data.email) {
    const existing = await User.findOne({ email: data.email.toLowerCase() });
    if (existing) {
      throw new AppError(409, "EMAIL_ALREADY_EXISTS", "E-mail já cadastrado");
    }
  }

  const passwordHash = data.password ? await hashPassword(data.password) : undefined;

  const child = await User.create({
    churchId: parent.churchId,
    name: data.name,
    birthDate,
    phone: data.phone,
    email: data.email?.toLowerCase(),
    passwordHash,
    roles: ["visitor"],
  });

  parent.set("familyData.childrenIds", [...(parent.familyData?.childrenIds ?? []), child._id]);
  await parent.save();

  return toUserDTO(child);
}

export async function listUsers(requester: AuthTokenPayload, churchId?: string): Promise<UserDTO[]> {
  const targetChurchId = isDevAdmin(requester) && churchId ? churchId : requester.churchId;
  const users = await User.find({ churchId: targetChurchId }).sort({ name: 1 });

  return users.map(toUserDTO);
}

export async function getUser(requester: AuthTokenPayload, userId: string): Promise<UserDTO> {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  const isSelf = String(user._id) === requester.sub;
  const isAdmin = isAdminOf(requester, String(user.churchId));
  const isFamily = !isSelf && !isAdmin && (await isFamilyManager(requester.sub, String(user._id)));

  if (!isSelf && !isAdmin && !isFamily) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  return toUserDTO(user);
}

export async function updateUser(
  requester: AuthTokenPayload,
  userId: string,
  data: UpdateUserDTO,
): Promise<UserDTO> {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  const isSelf = String(user._id) === requester.sub;
  const isAdmin = isAdminOf(requester, String(user.churchId));
  const isFamily = !isSelf && !isAdmin && (await isFamilyManager(requester.sub, String(user._id)));

  if (!isSelf && !isAdmin && !isFamily) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  if (data.roles !== undefined) {
    if (!isAdmin) {
      throw new AppError(403, "FORBIDDEN", "Apenas administradores podem alterar os papéis do usuário");
    }

    if (data.roles.includes("devAdmin") && !isDevAdmin(requester)) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Apenas administradores da plataforma (devAdmin) podem conceder o papel devAdmin",
      );
    }

    user.roles = data.roles;
  }

  if (data.name !== undefined) user.name = data.name;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.photoUrl !== undefined) user.photoUrl = data.photoUrl;
  if (data.bio !== undefined) user.bio = data.bio;
  if (data.birthDate !== undefined) user.birthDate = new Date(data.birthDate);
  if (data.professionalData !== undefined) user.professionalData = data.professionalData;
  if (data.vehicles !== undefined) {
    user.vehicles = data.vehicles as unknown as typeof user.vehicles;
  }
  if (data.medicalRecord !== undefined) {
    user.medicalRecord = data.medicalRecord as unknown as typeof user.medicalRecord;
  }

  if (data.familyData !== undefined) {
    if (!isSelf && !isAdmin) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Apenas o próprio usuário ou um administrador podem atualizar dados familiares",
      );
    }

    if (data.familyData.spouseId !== undefined && !isAdmin) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "O vínculo de cônjuge é automático e só é concluído pelo próprio cônjuge",
      );
    }

    user.familyData = data.familyData as unknown as typeof user.familyData;
  }

  if (data.active !== undefined) {
    if (!isSelf && !isAdmin) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Apenas o próprio usuário ou um administrador podem ativar/inativar a conta",
      );
    }
    user.active = data.active;
  }

  await user.save();

  if (data.phone !== undefined) {
    await tryLinkSpouse(user);
  }

  return toUserDTO(user);
}
