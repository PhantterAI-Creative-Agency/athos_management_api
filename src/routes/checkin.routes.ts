import { Router } from "express";
import * as checkinController from "../controllers/checkin.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import {
  checkinTokenQuerySchema,
  listCheckinQuerySchema,
  registerCheckinSchema,
} from "../interfaces/checkin.interface";

const router = Router();

router.get("/token", authenticate, validate(checkinTokenQuerySchema, "query"), checkinController.getToken);

router.post("/", authenticate, validate(registerCheckinSchema), checkinController.register);

router.get("/", authenticate, validate(listCheckinQuerySchema, "query"), checkinController.list);

export default router;
