import { User } from "../models/User.model";
import { Ministry } from "../models/Ministry.model";
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
import type { AuthTokensDTO, AuthenticatedUserDTO, LoginResultDTO } from "../interfaces/auth.interface";

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

export async function oauthLogin(provider: string): Promise<never> {
  throw new AppError(501, "NOT_IMPLEMENTED", `Login via ${provider} ainda não implementado`);
}
