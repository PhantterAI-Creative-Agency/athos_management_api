import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { ROLES } from "../helpers/jwt.helper";

const userSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String },
    isChurchMember: { type: Boolean },
    address: {
      type: new Schema(
        {
          cep: { type: String },
          street: { type: String },
          neighborhood: { type: String },
          city: { type: String },
          state: { type: String },
          number: { type: String },
          complement: { type: String },
        },
        { _id: false },
      ),
      default: undefined,
    },
    photoUrl: { type: String },
    bio: { type: String },
    birthDate: { type: Date },
    roles: { type: [String], enum: ROLES, default: ["visitor"] },
    active: { type: Boolean, default: true },
    // true enquanto o cadastro feito pelo site aguarda a primeira ativação por um administrador.
    pendingApproval: { type: Boolean, default: false },
    professionalData: {
      company: { type: String },
      role: { type: String },
    },
    familyData: {
      spouseId: { type: Schema.Types.ObjectId, ref: "User" },
      childrenIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
      spousePending: {
        type: new Schema(
          {
            name: { type: String },
            phone: { type: String },
            email: { type: String },
          },
          { _id: false },
        ),
        default: undefined,
      },
    },
    vehicles: [
      {
        plate: { type: String, required: true },
        model: { type: String, required: true },
      },
    ],
    medicalRecord: {
      bloodType: { type: String },
      allergies: [{ type: String }],
    },
    streak: { type: Number, default: 0 },
    badges: [{ type: Schema.Types.ObjectId, ref: "Badge" }],
    friendsCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    followersCount: { type: Number, default: 0 },
    refreshTokenHash: { type: String, select: false },
    passwordResetCodeHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordResetAttempts: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };

export const User = model("User", userSchema);
