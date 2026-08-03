import { z } from "zod";
import { ROLES, type Role } from "../helpers/jwt.helper";

export const createUserSchema = z.object({
  churchId: z.string().min(1, "churchId é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
  phone: z.string().optional(),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;

export const createChildSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório"),
    birthDate: z.string().min(1, "Data de nascimento é obrigatória"),
    phone: z.string().optional(),
    email: z.string().email("E-mail inválido").optional(),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").optional(),
  })
  .refine((data) => (data.email ? !!data.password : !data.password), {
    message: "Informe e-mail e senha juntos para criar login do filho",
    path: ["email"],
  });

export type CreateChildDTO = z.infer<typeof createChildSchema>;

export const listUsersQuerySchema = z.object({
  churchId: z.string().optional(),
});

export type ListUsersQueryDTO = z.infer<typeof listUsersQuerySchema>;

const professionalDataSchema = z.object({
  company: z.string().optional(),
  role: z.string().optional(),
});

const spousePendingSchema = z
  .object({
    name: z.string().min(1, "Nome é obrigatório"),
    phone: z.string().optional(),
    email: z.string().email("E-mail inválido").optional(),
  })
  .refine((data) => !!data.phone || !!data.email, {
    message: "Informe ao menos telefone ou e-mail do cônjuge",
    path: ["phone"],
  });

const familyDataSchema = z.object({
  spouseId: z.string().optional(),
  childrenIds: z.array(z.string()).optional(),
  spousePending: spousePendingSchema.optional(),
});

const vehicleSchema = z.object({
  plate: z.string().min(1),
  model: z.string().min(1),
});

const medicalRecordSchema = z.object({
  bloodType: z.string().optional(),
  allergies: z.array(z.string()).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  photoUrl: z.string().max(2_000_000, "Imagem muito grande").optional(),
  bio: z.string().optional(),
  birthDate: z.string().optional(),
  professionalData: professionalDataSchema.optional(),
  familyData: familyDataSchema.optional(),
  vehicles: z.array(vehicleSchema).optional(),
  medicalRecord: medicalRecordSchema.optional(),
  active: z.boolean().optional(),
  roles: z.array(z.enum(ROLES)).min(1, "Informe ao menos um papel").optional(),
});

export type UpdateUserDTO = z.infer<typeof updateUserSchema>;

export interface UserDTO {
  id: string;
  churchId: string;
  name: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  bio?: string;
  birthDate?: string;
  roles: Role[];
  active: boolean;
  professionalData?: { company?: string; role?: string };
  familyData?: {
    spouseId?: string;
    childrenIds?: string[];
    spousePending?: { name: string; phone?: string; email?: string };
  };
  vehicles?: { plate: string; model: string }[];
  medicalRecord?: { bloodType?: string; allergies?: string[] };
  createdAt: string;
  updatedAt: string;
}
