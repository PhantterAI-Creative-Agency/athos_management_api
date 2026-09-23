import type { Types } from "mongoose";
import { randomInt } from "node:crypto";
import { User } from "../models/User.model";
import { enqueuePasswordResetEmail } from "../jobs/passwordResetEmail.job";
import { enqueueRegistrationEmail } from "../jobs/registrationEmail.job";
import { Church } from "../models/Church.model";
import { Ministry } from "../models/Ministry.model";
import { env } from "../config/env";
import { comparePassword, hashPassword } from "../helpers/password.helper";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AuthTokenPayload,
  type Role,
} from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import { tryLinkSpouse } from "../helpers/family.helper";
import type {
  AuthTokensDTO,
  AuthenticatedUserDTO,
  LoginResultDTO,
  RegisterDTO,
} from "../interfaces/auth.interface";

function buildPayload(user: {
  _id: unknown;
  churchId: unknown;
  roles: string[];
}): AuthTokenPayload {
  return {
    sub: String(user._id),
    churchId: String(user.churchId),
    roles: user.roles as Role[],
  };
}

async function toAuthenticatedUser(user: {
  _id: unknown;
  churchId: unknown;
  name: string;
  email?: string | null;
  roles: string[];
}): Promise<AuthenticatedUserDTO> {
  const ledMinistries = await Ministry.find({
    leader: String(user._id),
    churchId: String(user.churchId),
  }).select("_id");

  return {
    id: String(user._id),
    churchId: String(user.churchId),
    name: user.name,
    email: user.email as string,
    roles: user.roles as Role[],
    leaderMinistryIds: ledMinistries.map((ministry) => String(ministry._id)),
  };
}

async function listRegistrationRecipients(churchId: Types.ObjectId): Promise<string[]> {
  const admins = await User.find({ churchId, roles: { $in: ["admin", "devAdmin"] }, active: true }).select("email");
  const all = [env.GMAIL_APP_MAIL, ...env.REGISTRATION_NOTIFY_EMAILS.split(","), ...admins.map((a) => a.email)];

  return [...new Set(all.map((email) => email?.trim().toLowerCase()).filter((email): email is string => !!email))];
}

// Cria o usuário como inativo; um administrador precisa ativá-lo antes do primeiro login.
export async function register(data: RegisterDTO): Promise<string> {
  const church = await Church.findOne({ slug: data.churchSlug });

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  const email = data.email.toLowerCase();

  if (await User.exists({ email })) {
    throw new AppError(409, "EMAIL_ALREADY_EXISTS", "E-mail já cadastrado");
  }

  if (data.username && (await User.exists({ username: data.username }))) {
    throw new AppError(409, "USERNAME_ALREADY_EXISTS", "Nome de usuário já está em uso");
  }

  const address = data.address && Object.values(data.address).some(Boolean) ? data.address : undefined;

  let user;
  try {
    user = await User.create({
      churchId: church._id,
      name: data.name,
      email,
      username: data.username,
      passwordHash: await hashPassword(data.password),
      isChurchMember: data.isChurchMember,
      address,
      roles: ["visitor"],
      active: false,
      pendingApproval: true,
    });
  } catch (error) {
    // Corrida entre as checagens acima e os índices únicos.
    if ((error as { code?: number }).code === 11000) {
      throw new AppError(409, "EMAIL_ALREADY_EXISTS", "E-mail ou nome de usuário já cadastrado");
    }
    throw error;
  }

  try {
    await enqueueRegistrationEmail({
      recipients: await listRegistrationRecipients(church._id),
      churchName: church.name,
      name: data.name,
      email,
      username: data.username,
      isChurchMember: data.isChurchMember,
      address,
    });
  } catch (error) {
    // O cadastro já foi salvo; falha no aviso não deve derrubar a resposta ao usuário.
    console.error("[registration-email] falha ao enviar aviso", error);
  }

  return String(user._id);
}

export async function login(email: string, password: string): Promise<LoginResultDTO> {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");

  if (!user || !user.passwordHash) {
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos");
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos");
  }

  if (!user.active) {
    throw new AppError(403, "USER_INACTIVE", "Usuário inativo");
  }

  const payload = buildPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  user.refreshTokenHash = await hashPassword(refreshToken);
  await user.save();

  await tryLinkSpouse(user);

  return { accessToken, refreshToken, user: await toAuthenticatedUser(user) };
}

export async function refresh(refreshToken: string): Promise<AuthTokensDTO> {
  let payload: AuthTokenPayload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token inválido ou expirado");
  }

  const user = await User.findById(payload.sub).select("+refreshTokenHash");

  if (!user?.refreshTokenHash) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token inválido ou expirado");
  }

  const matchesStoredHash = await comparePassword(refreshToken, user.refreshTokenHash);

  if (!matchesStoredHash) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token inválido ou expirado");
  }

  if (!user.active) {
    throw new AppError(403, "USER_INACTIVE", "Usuário inativo");
  }

  const newPayload = buildPayload(user);
  const accessToken = signAccessToken(newPayload);
  const newRefreshToken = signRefreshToken(newPayload);

  user.refreshTokenHash = await hashPassword(newRefreshToken);
  await user.save();

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, { $unset: { refreshTokenHash: 1 } });
}

const RESET_CODE_LENGTH = 6;
const RESET_CODE_TTL_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;

function generateResetCode(): string {
  return Array.from({ length: RESET_CODE_LENGTH }, () => randomInt(0, 10)).join("");
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user || !user.active) return;

  const code = generateResetCode();

  await User.updateOne(
    { _id: user._id },
    {
      passwordResetCodeHash: await hashPassword(code),
      passwordResetExpiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000),
      passwordResetAttempts: 0,
    },
  );

  await enqueuePasswordResetEmail({
    to: user.email as string,
    name: user.name,
    code,
    expiresInMinutes: RESET_CODE_TTL_MINUTES,
  });
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<string> {
  const invalidCode = () => new AppError(400, "INVALID_RESET_CODE", "Código inválido ou expirado");

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+passwordResetCodeHash +passwordResetExpiresAt +passwordResetAttempts",
  );

  if (!user?.passwordResetCodeHash || !user.passwordResetExpiresAt || !user.active) {
    throw invalidCode();
  }

  if (user.passwordResetExpiresAt.getTime() < Date.now() || (user.passwordResetAttempts ?? 0) >= RESET_MAX_ATTEMPTS) {
    throw invalidCode();
  }

  const codeMatches = await comparePassword(code, user.passwordResetCodeHash);

  if (!codeMatches) {
    await User.updateOne({ _id: user._id }, { $inc: { passwordResetAttempts: 1 } });
    throw invalidCode();
  }

  await User.updateOne(
    { _id: user._id },
    {
      passwordHash: await hashPassword(newPassword),
      $unset: {
        passwordResetCodeHash: 1,
        passwordResetExpiresAt: 1,
        passwordResetAttempts: 1,
        refreshTokenHash: 1,
      },
    },
  );

  return String(user._id);
}

// Usuário já autenticado: não exige a senha atual. A sessão atual é mantida.
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  await User.updateOne({ _id: userId }, { passwordHash: await hashPassword(newPassword) });
}

export async function oauthLogin(provider: string): Promise<never> {
  throw new AppError(501, "NOT_IMPLEMENTED", `Login via ${provider} ainda não implementado`);
}
